const mongoose = require('mongoose');

const attendanceLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    clockIn: {
      type: Date,
      required: true,
    },
    clockOut: {
      type: Date,
      required: true,
    },
    durationMinutes: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Index to quickly fetch logs for a user or sort by clockIn time
attendanceLogSchema.index({ user: 1, clockIn: -1 });

module.exports = mongoose.model('AttendanceLog', attendanceLogSchema);
