const mongoose = require('mongoose');
const Cycle = require('../models/Cycle');
const Task = require('../models/Task');
const ProjectMember = require('../models/ProjectMember');
const { verifyProjectSubscription } = require('./subscription.controller');

async function getMembership(projectId, userId) {
  return ProjectMember.findOne({ project: projectId, user: userId });
}

/**
 * POST /api/projects/:projectId/cycles
 * Create a new cycle (Sprint). Admin only.
 */
exports.createCycle = async (req, res) => {
  try {
    const { projectId } = req.params;
    const membership = await getMembership(projectId, req.user._id);
    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only admins can create cycles' });
    }

    const subCoverage = await verifyProjectSubscription(projectId);
    if (!subCoverage.hasActiveSubscription) {
      return res.status(403).json({
        success: false,
        message: 'An active subscription is required to manage cycles.',
        isProjectLocked: true,
      });
    }

    const { name, description, startDate, endDate, status } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Cycle name is required' });
    }
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'Start date and end date are required' });
    }
    if (new Date(startDate) > new Date(endDate)) {
      return res.status(400).json({ success: false, message: 'End date must be on or after start date' });
    }

    // If starting as current, mark other active cycles as upcoming/completed if desired
    if (status === 'current') {
      await Cycle.updateMany(
        { project: projectId, status: 'current' },
        { status: 'completed' }
      );
    }

    const cycle = await Cycle.create({
      name: name.trim(),
      description: description || '',
      project: projectId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      status: status || 'upcoming',
      createdBy: req.user._id,
    });

    res.status(201).json({ success: true, cycle });
  } catch (err) {
    console.error('Create cycle error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to create cycle' });
  }
};

/**
 * GET /api/projects/:projectId/cycles
 * List all cycles in a project with progress metrics.
 */
exports.getCycles = async (req, res) => {
  try {
    const { projectId } = req.params;
    const membership = await getMembership(projectId, req.user._id);
    if (!membership) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const cycles = await Cycle.find({ project: projectId })
      .populate('createdBy', 'name email avatar')
      .sort({ startDate: -1 })
      .lean();

    // Compute task counts for each cycle
    const cycleStats = await Task.aggregate([
      { $match: { project: new mongoose.Types.ObjectId(projectId), cycle: { $ne: null } } },
      {
        $group: {
          _id: '$cycle',
          totalTasks: { $sum: 1 },
          completedTasks: {
            $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] },
          },
          inProgressTasks: {
            $sum: { $cond: [{ $in: ['$status', ['in_progress', 'in_review']] }, 1, 0] },
          },
          todoTasks: {
            $sum: { $cond: [{ $in: ['$status', ['todo', 'backlog']] }, 1, 0] },
          },
        },
      },
    ]);

    const statsMap = {};
    cycleStats.forEach((s) => {
      statsMap[s._id.toString()] = s;
    });

    const enriched = cycles.map((c) => {
      const s = statsMap[c._id.toString()] || { totalTasks: 0, completedTasks: 0, inProgressTasks: 0, todoTasks: 0 };
      const pct = s.totalTasks > 0 ? Math.round((s.completedTasks / s.totalTasks) * 100) : 0;
      return {
        ...c,
        totalTasks: s.totalTasks,
        completedTasks: s.completedTasks,
        inProgressTasks: s.inProgressTasks,
        todoTasks: s.todoTasks,
        progressPct: pct,
      };
    });

    res.json({ success: true, cycles: enriched });
  } catch (err) {
    console.error('Get cycles error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch cycles' });
  }
};

/**
 * GET /api/projects/:projectId/cycles/:cycleId
 * Get cycle details with assigned tasks.
 */
exports.getCycle = async (req, res) => {
  try {
    const { projectId, cycleId } = req.params;
    const membership = await getMembership(projectId, req.user._id);
    if (!membership) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const cycle = await Cycle.findOne({ _id: cycleId, project: projectId })
      .populate('createdBy', 'name email avatar')
      .lean();

    if (!cycle) {
      return res.status(404).json({ success: false, message: 'Cycle not found' });
    }

    const tasks = await Task.find({ project: projectId, cycle: cycleId })
      .populate('assignedTo', 'name email avatar')
      .populate('module', 'name status')
      .sort({ priority: 1, dueDate: 1 });

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => t.status === 'done').length;
    const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    res.json({
      success: true,
      cycle: {
        ...cycle,
        totalTasks,
        completedTasks,
        progressPct,
      },
      tasks,
    });
  } catch (err) {
    console.error('Get cycle error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch cycle' });
  }
};

/**
 * PATCH /api/projects/:projectId/cycles/:cycleId
 * Update cycle fields or complete cycle with optional rollover.
 */
exports.updateCycle = async (req, res) => {
  try {
    const { projectId, cycleId } = req.params;
    const membership = await getMembership(projectId, req.user._id);
    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only admins can update cycles' });
    }

    const cycle = await Cycle.findOne({ _id: cycleId, project: projectId });
    if (!cycle) {
      return res.status(404).json({ success: false, message: 'Cycle not found' });
    }

    const { name, description, startDate, endDate, status, rolloverToCycleId } = req.body;

    if (name) cycle.name = name.trim();
    if (description !== undefined) cycle.description = description;
    if (startDate) cycle.startDate = new Date(startDate);
    if (endDate) cycle.endDate = new Date(endDate);

    if (status && ['draft', 'upcoming', 'current', 'completed'].includes(status)) {
      if (status === 'current' && cycle.status !== 'current') {
        // Demote other current cycles
        await Cycle.updateMany(
          { project: projectId, _id: { $ne: cycleId }, status: 'current' },
          { status: 'completed' }
        );
      }
      cycle.status = status;
    }

    await cycle.save();

    // Rollover incomplete tasks if completing cycle
    let rolloverCount = 0;
    if (status === 'completed' && rolloverToCycleId !== undefined) {
      const updateResult = await Task.updateMany(
        { project: projectId, cycle: cycleId, status: { $nin: ['done', 'canceled'] } },
        { cycle: rolloverToCycleId ? rolloverToCycleId : null }
      );
      rolloverCount = updateResult.modifiedCount;
    }

    res.json({ success: true, cycle, rolloverCount });
  } catch (err) {
    console.error('Update cycle error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to update cycle' });
  }
};

/**
 * POST /api/projects/:projectId/cycles/:cycleId/rollover
 * Explicitly rollover unfinished tasks to another cycle or back to backlog.
 */
exports.rolloverCycle = async (req, res) => {
  try {
    const { projectId, cycleId } = req.params;
    const membership = await getMembership(projectId, req.user._id);
    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only admins can rollover tasks' });
    }

    const { targetCycleId } = req.body;

    const filter = { project: projectId, cycle: cycleId, status: { $nin: ['done', 'canceled'] } };
    const update = { cycle: targetCycleId ? targetCycleId : null };

    const result = await Task.updateMany(filter, update);

    res.json({
      success: true,
      message: `Rolled over ${result.modifiedCount} unfinished tasks`,
      rolledOverCount: result.modifiedCount,
    });
  } catch (err) {
    console.error('Rollover error:', err);
    res.status(500).json({ success: false, message: 'Failed to rollover tasks' });
  }
};

/**
 * DELETE /api/projects/:projectId/cycles/:cycleId
 * Delete cycle and detach assigned tasks.
 */
exports.deleteCycle = async (req, res) => {
  try {
    const { projectId, cycleId } = req.params;
    const membership = await getMembership(projectId, req.user._id);
    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only admins can delete cycles' });
    }

    await Cycle.deleteOne({ _id: cycleId, project: projectId });
    await Task.updateMany({ project: projectId, cycle: cycleId }, { cycle: null });

    res.json({ success: true, message: 'Cycle deleted' });
  } catch (err) {
    console.error('Delete cycle error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete cycle' });
  }
};
