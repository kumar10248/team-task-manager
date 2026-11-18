const mongoose = require('mongoose');

const intakeTicketSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Ticket title / subject is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    description: {
      type: String,
      required: [true, 'Ticket description is required'],
      trim: true,
      maxlength: [5000, 'Description cannot exceed 5000 characters'],
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Ticket must belong to a project'],
    },
    clientName: {
      type: String,
      required: [true, 'Client name is required'],
      trim: true,
      maxlength: [100, 'Client name cannot exceed 100 characters'],
    },
    clientEmail: {
      type: String,
      required: [true, 'Client email is required'],
      trim: true,
      lowercase: true,
      maxlength: [120, 'Email cannot exceed 120 characters'],
    },
    company: {
      type: String,
      trim: true,
      maxlength: [100, 'Company cannot exceed 100 characters'],
      default: '',
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },
    category: {
      type: String,
      enum: ['feature_request', 'bug_report', 'inquiry', 'support'],
      default: 'feature_request',
    },
    status: {
      type: String,
      enum: ['pending_review', 'accepted', 'declined'],
      default: 'pending_review',
    },
    declineReason: {
      type: String,
      trim: true,
      default: '',
    },
    convertedToTask: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      default: null,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

intakeTicketSchema.index({ project: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('IntakeTicket', intakeTicketSchema);
