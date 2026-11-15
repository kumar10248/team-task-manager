const mongoose = require('mongoose');

const paymentHistorySchema = new mongoose.Schema(
  {
    paymentId: { type: String, trim: true },
    orderId: { type: String, trim: true },
    amount: { type: Number, required: true },
    plan: { type: String, required: true },
    paidAt: { type: Date, default: Date.now },
    method: { type: String, default: 'razorpay' },
  },
  { _id: false }
);

const subscriptionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    plan: {
      type: String,
      enum: ['free', 'standard', 'pro'],
      default: 'free',
    },
    status: {
      type: String,
      enum: ['active', 'trialing', 'expired', 'cancelled', 'pending'],
      default: 'trialing',
    },
    amount: {
      type: Number,
      default: 0,
    },
    currency: {
      type: String,
      default: 'INR',
    },
    billingCycle: {
      type: String,
      enum: ['monthly', 'yearly'],
      default: 'monthly',
    },
    currentPeriodStart: {
      type: Date,
      default: Date.now,
    },
    currentPeriodEnd: {
      type: Date,
      default: () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // default 14 days trial
    },
    razorpayOrderId: {
      type: String,
      default: null,
    },
    razorpayPaymentId: {
      type: String,
      default: null,
    },
    razorpaySignature: {
      type: String,
      default: null,
    },
    cancelAtPeriodEnd: {
      type: Boolean,
      default: false,
    },
    isLifetime: {
      type: Boolean,
      default: false,
    },
    history: [paymentHistorySchema],
  },
  { timestamps: true }
);

// Virtual: is subscription currently active?
subscriptionSchema.virtual('isActive').get(function () {
  if (this.isLifetime) return true;
  if (this.status === 'active' || this.status === 'trialing') {
    return this.currentPeriodEnd ? new Date(this.currentPeriodEnd) > new Date() : false;
  }
  return false;
});

// Virtual: days remaining
subscriptionSchema.virtual('daysRemaining').get(function () {
  if (this.isLifetime) return 9999;
  if (!this.currentPeriodEnd) return 0;
  const diff = new Date(this.currentPeriodEnd).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
});

subscriptionSchema.set('toJSON', { virtuals: true });
subscriptionSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Subscription', subscriptionSchema);
