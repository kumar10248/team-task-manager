const mongoose = require('mongoose');
const Module = require('../models/Module');
const Task = require('../models/Task');
const ProjectMember = require('../models/ProjectMember');
const { verifyProjectSubscription } = require('./subscription.controller');

async function getMembership(projectId, userId) {
  return ProjectMember.findOne({ project: projectId, user: userId });
}

/**
 * POST /api/projects/:projectId/modules
 * Create a new module (Feature Milestone). Admin only.
 */
exports.createModule = async (req, res) => {
  try {
    const { projectId } = req.params;
    const membership = await getMembership(projectId, req.user._id);
    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only admins can create modules' });
    }

    const subCoverage = await verifyProjectSubscription(projectId);
    if (!subCoverage.hasActiveSubscription) {
      return res.status(403).json({
        success: false,
        message: 'An active subscription is required to manage feature modules.',
        isProjectLocked: true,
      });
    }

    const { name, description, status, startDate, targetDate, lead } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Module name is required' });
    }

    const newModule = await Module.create({
      name: name.trim(),
      description: description || '',
      project: projectId,
      status: status || 'planned',
      startDate: startDate ? new Date(startDate) : null,
      targetDate: targetDate ? new Date(targetDate) : null,
      lead: lead || null,
      createdBy: req.user._id,
    });

    const populated = await Module.findById(newModule._id)
      .populate('lead', 'name email avatar')
      .populate('createdBy', 'name email avatar');

    res.status(201).json({ success: true, module: populated });
  } catch (err) {
    console.error('Create module error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to create module' });
  }
};

/**
 * GET /api/projects/:projectId/modules
 * List all modules in a project with progress metrics.
 */
exports.getModules = async (req, res) => {
  try {
    const { projectId } = req.params;
    const membership = await getMembership(projectId, req.user._id);
    if (!membership) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const modules = await Module.find({ project: projectId })
      .populate('lead', 'name email avatar')
      .populate('createdBy', 'name email avatar')
      .sort({ createdAt: -1 })
      .lean();

    // Compute task counts for each module
    const moduleStats = await Task.aggregate([
      { $match: { project: new mongoose.Types.ObjectId(projectId), module: { $ne: null } } },
      {
        $group: {
          _id: '$module',
          totalTasks: { $sum: 1 },
          completedTasks: {
            $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] },
          },
        },
      },
    ]);

    const statsMap = {};
    moduleStats.forEach((s) => {
      statsMap[s._id.toString()] = s;
    });

    const enriched = modules.map((m) => {
      const s = statsMap[m._id.toString()] || { totalTasks: 0, completedTasks: 0 };
      const pct = s.totalTasks > 0 ? Math.round((s.completedTasks / s.totalTasks) * 100) : 0;
      return {
        ...m,
        totalTasks: s.totalTasks,
        completedTasks: s.completedTasks,
        progressPct: pct,
      };
    });

    res.json({ success: true, modules: enriched });
  } catch (err) {
    console.error('Get modules error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch modules' });
  }
};

/**
 * GET /api/projects/:projectId/modules/:moduleId
 * Get module details with its assigned tasks.
 */
exports.getModule = async (req, res) => {
  try {
    const { projectId, moduleId } = req.params;
    const membership = await getMembership(projectId, req.user._id);
    if (!membership) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const mod = await Module.findOne({ _id: moduleId, project: projectId })
      .populate('lead', 'name email avatar')
      .populate('createdBy', 'name email avatar')
      .lean();

    if (!mod) {
      return res.status(404).json({ success: false, message: 'Module not found' });
    }

    const tasks = await Task.find({ project: projectId, module: moduleId })
      .populate('assignedTo', 'name email avatar')
      .populate('cycle', 'name status')
      .sort({ priority: 1, dueDate: 1 });

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => t.status === 'done').length;
    const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    res.json({
      success: true,
      module: {
        ...mod,
        totalTasks,
        completedTasks,
        progressPct,
      },
      tasks,
    });
  } catch (err) {
    console.error('Get module error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch module' });
  }
};

/**
 * PATCH /api/projects/:projectId/modules/:moduleId
 * Update module.
 */
exports.updateModule = async (req, res) => {
  try {
    const { projectId, moduleId } = req.params;
    const membership = await getMembership(projectId, req.user._id);
    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only admins can update modules' });
    }

    const mod = await Module.findOne({ _id: moduleId, project: projectId });
    if (!mod) {
      return res.status(404).json({ success: false, message: 'Module not found' });
    }

    const { name, description, status, startDate, targetDate, lead } = req.body;

    if (name) mod.name = name.trim();
    if (description !== undefined) mod.description = description;
    if (status) mod.status = status;
    if (startDate !== undefined) mod.startDate = startDate ? new Date(startDate) : null;
    if (targetDate !== undefined) mod.targetDate = targetDate ? new Date(targetDate) : null;
    if (lead !== undefined) mod.lead = lead || null;

    await mod.save();

    const populated = await Module.findById(mod._id)
      .populate('lead', 'name email avatar')
      .populate('createdBy', 'name email avatar');

    res.json({ success: true, module: populated });
  } catch (err) {
    console.error('Update module error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to update module' });
  }
};

/**
 * DELETE /api/projects/:projectId/modules/:moduleId
 * Delete module and detach assigned tasks.
 */
exports.deleteModule = async (req, res) => {
  try {
    const { projectId, moduleId } = req.params;
    const membership = await getMembership(projectId, req.user._id);
    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only admins can delete modules' });
    }

    await Module.deleteOne({ _id: moduleId, project: projectId });
    await Task.updateMany({ project: projectId, module: moduleId }, { module: null });

    res.json({ success: true, message: 'Module deleted' });
  } catch (err) {
    console.error('Delete module error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete module' });
  }
};
