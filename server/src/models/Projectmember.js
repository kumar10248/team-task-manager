const mongoose = require('mongoose');

/**
 * ProjectMember — join table linking Users to Projects with roles.
 * Roles:
 *   admin  — full CRUD on tasks and members
 *   member — view and update only their assigned tasks
 */
const projectMemberSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    role: {
      type: String,
      enum: ['admin', 'member'],
      default: 'member',
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// A user can only be a member of a project once
projectMemberSchema.index({ project: 1, user: 1 }, { unique: true });
projectMemberSchema.index({ user: 1 });
projectMemberSchema.index({ project: 1 });

module.exports = mongoose.model('ProjectMember', projectMemberSchema);