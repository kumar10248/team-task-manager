const crypto = require('crypto');
const path = require('path');
const Razorpay = require('razorpay');
const Subscription = require('../models/Subscription');

/**
 * Returns an instance of Razorpay, reloading environment variables if needed
 */
const getRazorpayInstance = () => {
  try {
    require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), override: true });
    require('dotenv').config({ override: false });
  } catch {}

  const key_id = (process.env.RAZORPAY_KEY_ID || '').trim();
  const key_secret = (process.env.RAZORPAY_KEY_SECRET || '').trim();

  if (!key_id || !key_secret) return null;
  return new Razorpay({ key_id, key_secret });
};

/**
 * POST /api/create-order
 * Request: { amount (in paise, min 100), currency, receipt, plan, notes }
 * Return: { success: true, order_id, amount, currency, key_id }
 */
exports.createOrder = async (req, res) => {
  try {
    let { amount, currency = 'INR', receipt, plan, notes = {} } = req.body || {};

    // If plan is provided without explicit amount in paise, resolve from known plans
    if (!amount && plan) {
      if (plan === 'standard') amount = 200000; // ₹2,000 in paise
      else if (plan === 'pro') amount = 300000; // ₹3,000 in paise
    }

    // Amount validation: must be at least 100 paise (₹1)
    const numericAmount = Number(amount);
    if (!amount || isNaN(numericAmount) || numericAmount < 100) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount. Minimum order amount must be at least 100 paise (₹1).',
      });
    }

    const razorpay = getRazorpayInstance();
    if (!razorpay) {
      return res.status(500).json({
        success: false,
        message: 'Razorpay keys not configured on server. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.',
      });
    }

    const orderReceipt = receipt || `rcpt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Call Razorpay API: POST https://api.razorpay.com/v1/orders
    const options = {
      amount: Math.round(numericAmount),
      currency: currency.toUpperCase(),
      receipt: String(orderReceipt).substring(0, 40),
      notes: {
        ...notes,
        ...(plan ? { plan } : {}),
        ...(req.user?._id ? { userId: req.user._id.toString() } : {}),
      },
    };

    const order = await razorpay.orders.create(options);

    // If authenticated user, save pending razorpayOrderId on subscription
    if (req.user?._id) {
      await Subscription.findOneAndUpdate(
        { user: req.user._id },
        { user: req.user._id, razorpayOrderId: order.id },
        { upsert: true, new: true }
      ).catch(() => {});
    }

    return res.status(200).json({
      success: true,
      order_id: order.id,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt,
      key_id: (process.env.RAZORPAY_KEY_ID || '').trim(),
    });
  } catch (err) {
    console.error('Create Razorpay order error:', err);
    // Handle auth failure vs generic API error
    if (err.statusCode === 401 || err.status === 401) {
      return res.status(401).json({
        success: false,
        message: 'Razorpay authentication failed: Invalid API credentials.',
      });
    }
    return res.status(500).json({
      success: false,
      message: err.error?.description || err.message || 'Failed to create Razorpay order',
    });
  }
};

/**
 * POST /api/verify-payment
 * Algorithm: HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)
 * Compare generated signature with razorpay_signature
 * Request: { razorpay_order_id | order_id, razorpay_payment_id | payment_id, razorpay_signature | signature, plan }
 */
exports.verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      order_id,
      razorpay_payment_id,
      payment_id,
      razorpay_signature,
      signature,
      plan,
    } = req.body || {};

    const resolvedOrderId = razorpay_order_id || order_id;
    const resolvedPaymentId = razorpay_payment_id || payment_id;
    const resolvedSignature = razorpay_signature || signature;

    // Check for missing fields
    if (!resolvedOrderId || !resolvedPaymentId || !resolvedSignature) {
      return res.status(400).json({
        success: false,
        isPaid: false,
        message: 'Missing required payment verification fields. razorpay_order_id, razorpay_payment_id, and razorpay_signature are required.',
      });
    }

    const key_secret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
    if (!key_secret) {
      return res.status(500).json({
        success: false,
        isPaid: false,
        message: 'Razorpay secret key not configured on server.',
      });
    }

    // Algorithm: HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)
    const expectedSignature = crypto
      .createHmac('sha256', key_secret)
      .update(`${resolvedOrderId}|${resolvedPaymentId}`)
      .digest('hex');

    // Safe comparison
    let signaturesMatch = false;
    try {
      signaturesMatch = crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'utf-8'),
        Buffer.from(resolvedSignature, 'utf-8')
      );
    } catch {
      signaturesMatch = expectedSignature === resolvedSignature;
    }

    if (!signaturesMatch) {
      return res.status(400).json({
        success: false,
        isPaid: false,
        message: 'Signature mismatch: Payment verification failed. Signature does not match.',
      });
    }

    // If an authenticated user is paying for a plan, activate subscription
    let updatedSub = null;
    if (req.user?._id) {
      const now = new Date();
      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      const planName = plan === 'pro' ? 'Pro Plan' : plan === 'standard' ? 'Standard Plan' : 'Subscription';
      const planPrice = plan === 'pro' ? 3000 : plan === 'standard' ? 2000 : 0;

      // Detect payment method (UPI, Card, Netbanking, etc.) from Razorpay API or request
      let detectedMethod = (req.body?.payment_method || req.body?.method || 'UPI').toUpperCase();
      const razorpayInstance = getRazorpayInstance();
      if (razorpayInstance && resolvedPaymentId && !resolvedPaymentId.startsWith('pay_mock_') && !resolvedPaymentId.startsWith('pay_test_')) {
        try {
          const paymentDetails = await razorpayInstance.payments.fetch(resolvedPaymentId);
          if (paymentDetails?.method) {
            detectedMethod = paymentDetails.method.toUpperCase();
          }
        } catch {}
      }

      updatedSub = await Subscription.findOneAndUpdate(
        { user: req.user._id },
        {
          user: req.user._id,
          ...(plan ? { plan } : {}),
          status: 'active',
          amount: planPrice,
          currency: 'INR',
          billingCycle: 'monthly',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          razorpayOrderId: resolvedOrderId,
          razorpayPaymentId: resolvedPaymentId,
          razorpaySignature: resolvedSignature,
          $push: {
            history: {
              paymentId: resolvedPaymentId,
              orderId: resolvedOrderId,
              amount: planPrice,
              plan: planName,
              paidAt: now,
              gateway: 'Razorpay',
              method: detectedMethod,
              paymentMethod: detectedMethod,
            },
          },
        },
        { upsert: true, new: true }
      ).catch(() => null);

      try {
        require('./notification.controller').createNotification({
          recipient: req.user._id,
          sender: req.user._id,
          type: 'comment',
          text: `Payment confirmed! Transaction ID: ${resolvedPaymentId}. Subscription active for 30 days.`,
        });
      } catch {}
    }

    return res.status(200).json({
      success: true,
      isPaid: true,
      message: 'Payment verified successfully',
      order_id: resolvedOrderId,
      payment_id: resolvedPaymentId,
      subscription: updatedSub,
    });
  } catch (err) {
    console.error('Verify Razorpay signature error:', err);
    return res.status(500).json({
      success: false,
      isPaid: false,
      message: 'Internal server error while verifying payment signature',
    });
  }
};
