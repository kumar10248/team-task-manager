const mongoose = require('mongoose');

const cycleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Cycle name is required'],
      trim: true,
      maxlength: [100, 'Cycle name cannot exceed 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
      default: '',
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Cycle must belong to a project'],
    },
    startDate: {
      type: Date,
      required: [true, 'Start date is required'],
    },
    endDate: {
      type: Date,
      required: [true, 'End date is required'],
    },
    status: {
      type: String,
      enum: ['draft', 'upcoming', 'current', 'completed'],
      default: 'upcoming',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

cycleSchema.index({ project: 1, status: 1 });
cycleSchema.index({ project: 1, startDate: -1 });

module.exports = mongoose.model('Cycle', cycleSchema);
