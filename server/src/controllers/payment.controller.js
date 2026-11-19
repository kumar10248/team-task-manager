const crypto = require('crypto');
const path = require('path');
const Razorpay = require('razorpay');
const Subscription = require('../models/Subscription');

/**
 * Server-authoritative plan catalog and pricing in paise & rupees.
 * Any client-supplied amount for subscription plans is strictly overridden.
 */
const PLAN_PRICES = {
  standard: {
    id: 'standard',
    name: 'Standard Plan',
    paise: 200000, // ₹2,000 in paise
    rupees: 2000,
  },
  pro: {
    id: 'pro',
    name: 'Pro Plan',
    paise: 300000, // ₹3,000 in paise
    rupees: 3000,
  },
};

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

    let numericAmount = 0;

    // Strict server authority: if a subscription plan is requested, force server-side price
    if (plan) {
      if (!req.user?._id) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required to initiate a subscription purchase.',
        });
      }

      const planConfig = PLAN_PRICES[plan];
      if (!planConfig) {
        return res.status(400).json({
          success: false,
          message: 'Invalid plan selected. Choose either "standard" or "pro".',
        });
      }

      // Overwrite any client-provided amount with server-defined price
      numericAmount = planConfig.paise;
    } else {
      // Ad-hoc payment: validate amount is a valid positive number >= ₹1 (100 paise)
      numericAmount = Number(amount);
      if (!amount || isNaN(numericAmount) || numericAmount < 100) {
        return res.status(400).json({
          success: false,
          message: 'Invalid amount. Minimum order amount must be at least 100 paise (₹1).',
        });
      }
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
 * Compare generated signature with razorpay_signature and verify captured amount with Razorpay
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

    if (plan && !req.user?._id) {
      return res.status(401).json({
        success: false,
        isPaid: false,
        message: 'Authentication required to verify a subscription purchase.',
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

    // Timing-safe signature comparison
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

    const razorpayInstance = getRazorpayInstance();
    if (!razorpayInstance) {
      return res.status(500).json({
        success: false,
        isPaid: false,
        message: 'Razorpay client configuration missing.',
      });
    }

    // Fetch genuine payment object directly from Razorpay to verify amount, currency, and status
    let paymentDetails = null;
    try {
      paymentDetails = await razorpayInstance.payments.fetch(resolvedPaymentId);
    } catch (fetchErr) {
      console.error('Failed to fetch payment details from Razorpay:', fetchErr);
      return res.status(400).json({
        success: false,
        isPaid: false,
        message: 'Unable to retrieve payment record from payment gateway.',
      });
    }

    if (!paymentDetails) {
      return res.status(400).json({
        success: false,
        isPaid: false,
        message: 'Payment verification failed: Record not found on Razorpay.',
      });
    }

    // Validate that payment matches the order
    if (paymentDetails.order_id && paymentDetails.order_id !== resolvedOrderId) {
      return res.status(400).json({
        success: false,
        isPaid: false,
        message: 'Payment verification failed: Payment ID does not match the order ID.',
      });
    }

    // Validate payment status
    if (paymentDetails.status !== 'captured' && paymentDetails.status !== 'authorized') {
      return res.status(400).json({
        success: false,
        isPaid: false,
        message: `Payment verification failed: Invalid transaction status "${paymentDetails.status}".`,
      });
    }

    // If purchasing a plan, verify the paid amount strictly matches the plan price
    let planConfig = null;
    if (plan) {
      planConfig = PLAN_PRICES[plan];
      if (!planConfig) {
        return res.status(400).json({
          success: false,
          isPaid: false,
          message: 'Invalid plan selected.',
        });
      }

      if (Number(paymentDetails.amount) < planConfig.paise) {
        return res.status(400).json({
          success: false,
          isPaid: false,
          message: `Payment amount tampering detected: Paid ₹${paymentDetails.amount / 100} does not cover ${planConfig.name} (₹${planConfig.rupees}).`,
        });
      }
    }

    // Replay attack prevention: verify paymentId hasn't already been used by another user
    if (req.user?._id) {
      const existingOtherSub = await Subscription.findOne({
        user: { $ne: req.user._id },
        $or: [
          { razorpayPaymentId: resolvedPaymentId },
          { 'history.paymentId': resolvedPaymentId },
        ],
      });

      if (existingOtherSub) {
        return res.status(400).json({
          success: false,
          isPaid: false,
          message: 'Payment replay detected: This transaction has already been credited to another account.',
        });
      }

      // Idempotency check: if user already has this payment in history, return current status
      const existingUserSub = await Subscription.findOne({ user: req.user._id });
      const alreadyCredited = existingUserSub?.history?.some((h) => h.paymentId === resolvedPaymentId);
      if (alreadyCredited) {
        return res.status(200).json({
          success: true,
          isPaid: true,
          message: 'Payment already verified and active.',
          order_id: resolvedOrderId,
          payment_id: resolvedPaymentId,
          subscription: existingUserSub,
        });
      }
    }

    // If an authenticated user is paying for a plan, activate subscription
    let updatedSub = null;
    if (req.user?._id && planConfig) {
      const now = new Date();
      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      const detectedMethod = (paymentDetails.method || req.body?.payment_method || req.body?.method || 'UPI').toUpperCase();

      updatedSub = await Subscription.findOneAndUpdate(
        { user: req.user._id },
        {
          user: req.user._id,
          plan: planConfig.id,
          status: 'active',
          amount: planConfig.rupees,
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
              amount: planConfig.rupees,
              plan: planConfig.name,
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
          text: `Payment confirmed! Transaction ID: ${resolvedPaymentId}. ${planConfig.name} active for 30 days.`,
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
