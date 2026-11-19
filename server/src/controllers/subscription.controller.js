const crypto = require('crypto');
const path = require('path');
const Razorpay = require('razorpay');
const Subscription = require('../models/Subscription');
const User = require('../models/User');

const PLANS = {
  free: {
    id: 'free',
    name: 'Free Trial',
    price: 0,
    interval: '14 days',
    features: [
      'Up to 3 active projects',
      'Up to 5 team members',
      'Kanban Board & Subtasks',
      'Schedule Meetings & Attendance',
    ],
    maxProjects: 3,
    maxMembers: 5,
  },
  standard: {
    id: 'standard',
    name: 'Standard Plan',
    price: 2000,
    amountInPaise: 200000,
    currency: 'INR',
    interval: 'month',
    features: [
      'Up to 15 active projects',
      'Up to 25 team members',
      'Kanban Board with Drag & Drop',
      'Interactive Subtasks & Checklists',
      'Project-specific Custom Taglines',
      'Video Meetings & Attendance Logs',
      'CSV Task Exports & Reports',
      'Standard Email Support',
    ],
    maxProjects: 15,
    maxMembers: 25,
  },
  pro: {
    id: 'pro',
    name: 'Pro Plan',
    price: 3000,
    amountInPaise: 300000,
    currency: 'INR',
    interval: 'month',
    features: [
      'Unlimited active projects',
      'Unlimited team members',
      'Everything in Standard',
      'Multi-Member Task Assignment',
      'Advanced Attendance & Clock-In/Out analytics',
      'Meeting Recordings & Agenda Sync',
      'Priority 24/7 VIP Support',
      'Early Access to new features',
    ],
    maxProjects: Infinity,
    maxMembers: Infinity,
  },
};

/**
 * Returns an instance of Razorpay, dynamically reloading .env if needed
 */
const getRazorpayInstance = () => {
  try {
    require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), override: true });
  } catch {}

  const key_id = (process.env.RAZORPAY_KEY_ID || '').trim();
  const key_secret = (process.env.RAZORPAY_KEY_SECRET || '').trim();

  if (!key_id || !key_secret) return null;
  return new Razorpay({ key_id, key_secret });
};

/**
 * Helper: checks whether a single project has active subscription coverage
 * (Owner OR any Admin has an active subscription or valid trial).
 */
const verifyProjectSubscription = async (projectId) => {
  const Project = require('../models/Project');
  const ProjectMember = require('../models/ProjectMember');

  const project = await Project.findById(projectId).select('createdBy').lean();
  if (!project) return { hasActiveSubscription: false };

  const adminMembers = await ProjectMember.find({
    project: projectId,
    role: 'admin',
  }).select('user').lean();

  const leaderUserIds = [
    project.createdBy,
    ...adminMembers.map((m) => m.user),
  ].filter(Boolean);

  const activeSub = await Subscription.findOne({
    user: { $in: leaderUserIds },
    $or: [
      { status: 'active' },
      { isLifetime: true },
      { status: 'trialing', currentPeriodEnd: { $gt: new Date() } },
    ],
  }).populate('user', 'name email').lean();

  if (activeSub) {
    return {
      hasActiveSubscription: true,
      subscriberName: activeSub.user?.name,
      plan: activeSub.plan,
    };
  }

  return {
    hasActiveSubscription: false,
  };
};

/**
 * Helper: checks subscription coverage for a list of projects in bulk.
 * Returns: { [projectId]: boolean }
 */
const getProjectsSubscriptionMap = async (projectIds) => {
  if (!projectIds || projectIds.length === 0) return {};
  const Project = require('../models/Project');
  const ProjectMember = require('../models/ProjectMember');

  const [projects, adminMembers] = await Promise.all([
    Project.find({ _id: { $in: projectIds } }).select('_id createdBy').lean(),
    ProjectMember.find({ project: { $in: projectIds }, role: 'admin' }).select('project user').lean(),
  ]);

  const projectLeadersMap = {};
  const allLeaderIds = new Set();

  projects.forEach((p) => {
    const pid = p._id.toString();
    projectLeadersMap[pid] = new Set();
    if (p.createdBy) {
      const ownerId = p.createdBy.toString();
      projectLeadersMap[pid].add(ownerId);
      allLeaderIds.add(ownerId);
    }
  });

  adminMembers.forEach((m) => {
    const pid = m.project.toString();
    if (projectLeadersMap[pid] && m.user) {
      const adminId = m.user.toString();
      projectLeadersMap[pid].add(adminId);
      allLeaderIds.add(adminId);
    }
  });

  const activeSubs = await Subscription.find({
    user: { $in: Array.from(allLeaderIds) },
    $or: [
      { status: 'active' },
      { isLifetime: true },
      { status: 'trialing', currentPeriodEnd: { $gt: new Date() } },
    ],
  }).select('user plan').lean();

  const activeUserSet = new Set(activeSubs.map((s) => s.user.toString()));

  const resultMap = {};
  for (const pid of projectIds) {
    const pidStr = pid.toString();
    const leaders = projectLeadersMap[pidStr] || new Set();
    let hasActive = false;
    for (const leaderId of leaders) {
      if (activeUserSet.has(leaderId)) {
        hasActive = true;
        break;
      }
    }
    resultMap[pidStr] = hasActive;
  }

  return resultMap;
};

/**
 * Helper: checks user's own subscription and whether they are an invited member
 * covered by another active admin's subscription.
 */
const checkUserSubscriptionCoverage = async (userId) => {
  const Project = require('../models/Project');
  const ProjectMember = require('../models/ProjectMember');

  let sub = await Subscription.findOne({ user: userId });
  if (!sub) {
    sub = await Subscription.create({
      user: userId,
      plan: 'free',
      status: 'trialing',
      amount: 0,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    });
  } else if (
    sub.currentPeriodEnd &&
    new Date(sub.currentPeriodEnd) < new Date() &&
    (sub.status === 'active' || sub.status === 'trialing')
  ) {
    sub.status = 'expired';
    await sub.save();
  }

  const ownedProjectsCount = await Project.countDocuments({ createdBy: userId });

  // Only check other project leaders (exclude the user themselves)
  const memberships = await ProjectMember.find({ user: userId })
    .populate({
      path: 'project',
      select: 'createdBy name',
    })
    .lean();

  const otherLeaderIds = memberships
    .map((m) => m.project?.createdBy?.toString())
    .filter((ownerId) => ownerId && ownerId !== userId.toString());

  let isCoveredByAdmin = false;
  let coveringAdminName = null;

  if (otherLeaderIds.length > 0) {
    const adminSubs = await Subscription.find({
      user: { $in: otherLeaderIds },
      $or: [
        { status: 'active' },
        { isLifetime: true },
        { status: 'trialing', currentPeriodEnd: { $gt: new Date() } },
      ],
    }).populate('user', 'name email').lean();

    const validAdminSub = adminSubs.find(
      (s) => !s.currentPeriodEnd || new Date(s.currentPeriodEnd) > new Date()
    );

    if (validAdminSub) {
      isCoveredByAdmin = true;
      coveringAdminName = validAdminSub.user?.name || 'Workspace Admin';
    }
  }

  return {
    subscription: sub,
    isCoveredByAdmin,
    coveringAdminName,
    ownedProjectsCount,
  };
};

exports.verifyProjectSubscription = verifyProjectSubscription;
exports.getProjectsSubscriptionMap = getProjectsSubscriptionMap;
exports.checkUserSubscriptionCoverage = checkUserSubscriptionCoverage;

/**
 * GET /api/subscriptions
 * Fetch current user's subscription status & available plans
 */
exports.getSubscription = async (req, res) => {
  try {
    const coverage = await checkUserSubscriptionCoverage(req.user._id);

    const razorpay = getRazorpayInstance();
    const keyId = (process.env.RAZORPAY_KEY_ID || '').trim();

    res.json({
      success: true,
      subscription: coverage.subscription,
      plans: PLANS,
      razorpayKeyId: keyId,
      isConfigured: !!razorpay,
      isCoveredByAdmin: coverage.isCoveredByAdmin,
      coveringAdminName: coverage.coveringAdminName,
      ownedProjectsCount: coverage.ownedProjectsCount,
    });
  } catch (err) {
    console.error('Get subscription error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch subscription' });
  }
};

/**
 * POST /api/subscriptions/create-order
 * Create a Razorpay Order for ₹2,000/mo or ₹3,000/mo
 * Body: { plan: 'standard' | 'pro' }
 */
exports.createOrder = async (req, res) => {
  try {
    const { plan } = req.body;
    if (!plan || !PLANS[plan] || plan === 'free') {
      return res.status(400).json({ success: false, message: 'Invalid plan selected. Choose standard (₹2,000) or pro (₹3,000)' });
    }

    const selectedPlan = PLANS[plan];
    const razorpay = getRazorpayInstance();

    if (!razorpay) {
      return res.status(400).json({
        success: false,
        message: 'Razorpay keys not configured. Please ensure RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are set in server/.env.',
      });
    }

    const receipt = `rcpt_${req.user._id.toString().slice(-6)}_${Date.now()}`;

    // Create real Razorpay order
    const order = await razorpay.orders.create({
      amount: selectedPlan.amountInPaise,
      currency: 'INR',
      receipt,
      notes: {
        userId: req.user._id.toString(),
        plan: selectedPlan.id,
        email: req.user.email,
      },
    });

    // Save pending order reference
    await Subscription.findOneAndUpdate(
      { user: req.user._id },
      {
        user: req.user._id,
        razorpayOrderId: order.id,
      },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      order_id: order.id,
      orderId: order.id,
      amount: selectedPlan.price,
      amountInPaise: selectedPlan.amountInPaise,
      currency: 'INR',
      plan: selectedPlan,
      razorpayKeyId: (process.env.RAZORPAY_KEY_ID || '').trim(),
      isLiveConfigured: true,
    });
  } catch (err) {
    console.error('Create Razorpay order error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to create payment order' });
  }
};

/**
 * POST /api/subscriptions/verify-payment
 * Verify signature and activate 30-day subscription
 * Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan }
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

    if (!plan || !PLANS[plan] || plan === 'free') {
      return res.status(400).json({ success: false, message: 'Invalid plan' });
    }

    if (!resolvedOrderId || !resolvedPaymentId || !resolvedSignature) {
      return res.status(400).json({
        success: false,
        message: 'Missing Razorpay payment verification parameters',
      });
    }

    const key_secret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
    if (!key_secret) {
      return res.status(500).json({
        success: false,
        message: 'Razorpay secret key not configured on server',
      });
    }

    // Verify HMAC-SHA256 signature
    const hmac = crypto.createHmac('sha256', key_secret);
    hmac.update(`${resolvedOrderId}|${resolvedPaymentId}`);
    const expectedSignature = hmac.digest('hex');

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
        message: 'Payment verification failed: invalid signature. Payment could not be confirmed.',
      });
    }

    const selectedPlan = PLANS[plan];
    const razorpay = getRazorpayInstance();
    if (!razorpay) {
      return res.status(500).json({
        success: false,
        message: 'Razorpay keys not configured on server',
      });
    }

    // Fetch genuine payment record directly from Razorpay to verify amount, order, and status
    let paymentDetails = null;
    try {
      paymentDetails = await razorpay.payments.fetch(resolvedPaymentId);
    } catch (fetchErr) {
      console.error('Failed to fetch payment details from Razorpay:', fetchErr);
      return res.status(400).json({
        success: false,
        message: 'Unable to retrieve payment record from payment gateway.',
      });
    }

    if (!paymentDetails) {
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed: Record not found on payment gateway.',
      });
    }

    // Verify order ID match
    if (paymentDetails.order_id && paymentDetails.order_id !== resolvedOrderId) {
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed: Payment ID does not match the order ID.',
      });
    }

    // Verify payment status
    if (paymentDetails.status !== 'captured' && paymentDetails.status !== 'authorized') {
      return res.status(400).json({
        success: false,
        message: `Payment verification failed: Invalid status "${paymentDetails.status}".`,
      });
    }

    // Strict amount verification: prevent price tampering
    if (Number(paymentDetails.amount) < selectedPlan.amountInPaise) {
      return res.status(400).json({
        success: false,
        message: `Payment amount tampering detected: Paid ₹${paymentDetails.amount / 100} does not cover ${selectedPlan.name} (₹${selectedPlan.price}).`,
      });
    }

    // Replay attack prevention: verify paymentId hasn't already been used by another user
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
        message: 'Payment replay detected: This transaction has already been credited to another account.',
      });
    }

    // Idempotency check: if user already has this payment in history, return current subscription
    const existingUserSub = await Subscription.findOne({ user: req.user._id });
    const alreadyCredited = existingUserSub?.history?.some((h) => h.paymentId === resolvedPaymentId);
    if (alreadyCredited) {
      return res.status(200).json({
        success: true,
        message: 'Payment already verified and active.',
        subscription: existingUserSub,
      });
    }

    const now = new Date();
    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days access

    // Detect payment method (UPI, Card, Netbanking, etc.) from Razorpay API or request
    let detectedMethod = (paymentDetails.method || req.body?.payment_method || req.body?.method || 'UPI').toUpperCase();

    const updatedSub = await Subscription.findOneAndUpdate(
      { user: req.user._id },
      {
        user: req.user._id,
        plan: selectedPlan.id,
        status: 'active',
        amount: selectedPlan.price,
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
            amount: selectedPlan.price,
            plan: selectedPlan.name,
            paidAt: now,
            gateway: 'Razorpay',
            method: detectedMethod,
            paymentMethod: detectedMethod,
          },
        },
      },
      { upsert: true, new: true }
    );

    // Send in-app notification
    try {
      require('./notification.controller').createNotification({
        recipient: req.user._id,
        sender: req.user._id,
        type: 'comment',
        text: `Your ${selectedPlan.name} (₹${selectedPlan.price.toLocaleString('en-IN')}/mo) is now active! Valid until ${periodEnd.toLocaleDateString('en-IN')}.`,
      });
    } catch {}

    res.json({
      success: true,
      message: `🎉 Success! Your ${selectedPlan.name} is now active.`,
      subscription: updatedSub,
    });
  } catch (err) {
    console.error('Verify payment error:', err);
    res.status(500).json({ success: false, message: 'Payment verification failed' });
  }
};

/**
 * POST /api/subscriptions/cancel
 * Cancel subscription renewal
 */
exports.cancelSubscription = async (req, res) => {
  try {
    const sub = await Subscription.findOne({ user: req.user._id });
    if (!sub) return res.status(404).json({ success: false, message: 'No active subscription found' });

    sub.cancelAtPeriodEnd = true;
    await sub.save();

    res.json({
      success: true,
      message: 'Subscription renewal cancelled. You will continue to have access until the end of your billing cycle.',
      subscription: sub,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to cancel subscription' });
  }
};

/**
 * POST /api/subscriptions/reset-trial
 * Reset subscription back to Free Trial (for testing Razorpay modal checkout)
 */
exports.resetTrial = async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production' && !req.user?.isSuperAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Trial reset is disabled in production for non-admin accounts.',
      });
    }

    const periodEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const updatedSub = await Subscription.findOneAndUpdate(
      { user: req.user._id },
      {
        user: req.user._id,
        plan: 'free',
        status: 'trialing',
        amount: 0,
        currency: 'INR',
        billingCycle: 'monthly',
        cancelAtPeriodEnd: false,
        currentPeriodStart: new Date(),
        currentPeriodEnd: periodEnd,
        razorpayOrderId: null,
        razorpayPaymentId: null,
        razorpaySignature: null,
      },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      message: 'Subscription reset back to 14-day Free Trial. You can now test the live Razorpay checkout!',
      subscription: updatedSub,
    });
  } catch (err) {
    console.error('Reset trial error:', err);
    res.status(500).json({ success: false, message: 'Failed to reset subscription' });
  }
};

/**
 * POST /api/subscriptions/expire-trial
 * Simulates trial expiration for instant testing (Option A Lock Screen)
 */
exports.expireTrial = async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production' && !req.user?.isSuperAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Trial simulation is disabled in production for non-admin accounts.',
      });
    }

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const updatedSub = await Subscription.findOneAndUpdate(
      { user: req.user._id },
      {
        user: req.user._id,
        plan: 'free',
        status: 'expired',
        amount: 0,
        currency: 'INR',
        billingCycle: 'monthly',
        cancelAtPeriodEnd: false,
        currentPeriodStart: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: yesterday,
        razorpayOrderId: null,
        razorpayPaymentId: null,
        razorpaySignature: null,
      },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      message: 'Subscription marked as Expired. Option A Hard Paywall is now active!',
      subscription: updatedSub,
    });
  } catch (err) {
    console.error('Expire trial error:', err);
    res.status(500).json({ success: false, message: 'Failed to expire subscription' });
  }
};

/**
 * POST /api/subscriptions/webhook
 * Public Razorpay Webhook endpoint with mandatory cryptographic signature verification
 */
exports.handleWebhook = async (req, res) => {
  try {
    const webhookSecret = (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
    const signature = req.headers['x-razorpay-signature'];

    // Mandatory signature header validation: prevent unauthenticated spoofing
    if (!signature) {
      return res.status(400).json({ status: 'rejected', message: 'Missing x-razorpay-signature header' });
    }

    if (!webhookSecret) {
      console.error('[Razorpay Webhook] RAZORPAY_WEBHOOK_SECRET is not configured on the server. Rejecting webhook for security.');
      return res.status(500).json({ status: 'error', message: 'Webhook endpoint not configured' });
    }

    // Compute HMAC-SHA256 signature on exact raw payload bytes
    const shasum = crypto.createHmac('sha256', webhookSecret);
    const payloadBuffer = req.rawBody ? req.rawBody : Buffer.from(JSON.stringify(req.body));
    shasum.update(payloadBuffer);
    const expectedSignature = shasum.digest('hex');

    // Timing-safe signature comparison
    let signaturesMatch = false;
    try {
      signaturesMatch = crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'utf-8'),
        Buffer.from(signature, 'utf-8')
      );
    } catch {
      signaturesMatch = false;
    }

    if (!signaturesMatch) {
      return res.status(400).json({ status: 'invalid_signature' });
    }

    const event = req.body.event;
    const payload = req.body.payload;

    if (event === 'order.paid' || event === 'payment.captured') {
      const payment = payload?.payment?.entity;
      const notes = payment?.notes || {};
      const userId = notes.userId;
      const plan = notes.plan;

      if (userId && plan && PLANS[plan]) {
        const selectedPlan = PLANS[plan];

        // Verify captured payment amount matches plan price
        if (Number(payment.amount) < selectedPlan.amountInPaise) {
          console.warn(`[Razorpay Webhook] Amount mismatch: Paid ${payment.amount} < required ${selectedPlan.amountInPaise}`);
          return res.status(400).json({ status: 'amount_mismatch' });
        }

        // Replay / idempotency check: don't double process already credited payment
        const existingSub = await Subscription.findOne({
          $or: [
            { razorpayPaymentId: payment.id },
            { 'history.paymentId': payment.id },
          ],
        });

        if (existingSub) {
          return res.status(200).json({ status: 'already_processed' });
        }

        const now = new Date();
        const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        await Subscription.findOneAndUpdate(
          { user: userId },
          {
            plan: selectedPlan.id,
            status: 'active',
            amount: selectedPlan.price,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            razorpayPaymentId: payment.id,
            $push: {
              history: {
                paymentId: payment.id,
                orderId: payment.order_id,
                amount: selectedPlan.price,
                plan: selectedPlan.name,
                paidAt: now,
                method: payment.method || 'razorpay',
              },
            },
          },
          { upsert: true }
        );
      }
    }

    res.json({ status: 'ok' });
  } catch (err) {
    console.error('Razorpay webhook error:', err);
    res.status(500).json({ status: 'error' });
  }
};
