const IntakeTicket = require('../models/IntakeTicket');
const Project = require('../models/Project');
const ProjectMember = require('../models/ProjectMember');
const Task = require('../models/Task');
const { verifyProjectSubscription } = require('./subscription.controller');

async function getMembership(projectId, userId) {
  return ProjectMember.findOne({ project: projectId, user: userId });
}

/**
 * GET /api/intake/:projectId/info
 * Public endpoint to fetch project branding for public intake form.
 */
exports.getPublicProjectInfo = async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await Project.findById(projectId).select('name description color').lean();
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    res.json({
      success: true,
      project: {
        _id: project._id,
        name: project.name,
        description: project.description,
        color: project.color,
      },
    });
  } catch (err) {
    console.error('Get public project info error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch project info' });
  }
};

/**
 * POST /api/intake/:projectId
 * Public endpoint for clients to submit an intake ticket / inquiry.
 */
exports.submitPublicTicket = async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const { title, description, clientName, clientEmail, company, priority, category } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Ticket subject is required' });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ success: false, message: 'Ticket description is required' });
    }
    if (!clientName || !clientName.trim()) {
      return res.status(400).json({ success: false, message: 'Your name is required' });
    }
    if (!clientEmail || !clientEmail.trim()) {
      return res.status(400).json({ success: false, message: 'Your email address is required' });
    }

    const ticket = await IntakeTicket.create({
      title: title.trim(),
      description: description.trim(),
      project: projectId,
      clientName: clientName.trim(),
      clientEmail: clientEmail.trim().toLowerCase(),
      company: company ? company.trim() : '',
      priority: priority && ['low', 'medium', 'high', 'urgent'].includes(priority) ? priority : 'medium',
      category: category && ['feature_request', 'bug_report', 'inquiry', 'support'].includes(category) ? category : 'feature_request',
      status: 'pending_review',
    });

    // Notify project admins of the new incoming client ticket
    try {
      const adminMembers = await ProjectMember.find({ project: projectId, role: 'admin' }).select('user');
      const { createNotification } = require('./notification.controller');
      for (const m of adminMembers) {
        createNotification({
          recipient: m.user,
          type: 'system',
          project: projectId,
          text: `New client ticket "${ticket.title}" submitted by ${ticket.clientName} (${ticket.clientEmail})`,
        });
      }
    } catch (notifErr) {
      console.error('Failed to notify admins of intake ticket:', notifErr);
    }

    res.status(201).json({
      success: true,
      message: 'Ticket submitted successfully! Our team will review your request.',
      ticket: {
        _id: ticket._id,
        title: ticket.title,
        createdAt: ticket.createdAt,
      },
    });
  } catch (err) {
    console.error('Submit intake ticket error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to submit ticket' });
  }
};

/**
 * GET /api/projects/:projectId/intake
 * List intake tickets for a project (Triage Inbox). Project members only.
 */
exports.getProjectTickets = async (req, res) => {
  try {
    const { projectId } = req.params;
    const membership = await getMembership(projectId, req.user._id);
    if (!membership) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { status, category, search } = req.query;
    const filter = { project: projectId };

    if (status) filter.status = status;
    if (category) filter.category = category;
    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { title: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { clientName: { $regex: q, $options: 'i' } },
        { clientEmail: { $regex: q, $options: 'i' } },
        { company: { $regex: q, $options: 'i' } },
      ];
    }

    const tickets = await IntakeTicket.find(filter)
      .populate('reviewedBy', 'name email avatar')
      .populate('convertedToTask', 'title status priority')
      .sort({ createdAt: -1 })
      .lean();

    const pendingCount = await IntakeTicket.countDocuments({ project: projectId, status: 'pending_review' });

    res.json({ success: true, tickets, pendingCount });
  } catch (err) {
    console.error('Get intake tickets error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch tickets' });
  }
};

/**
 * PATCH /api/projects/:projectId/intake/:ticketId
 * Update ticket status (e.g. decline or accept). Admin only.
 */
exports.updateTicketStatus = async (req, res) => {
  try {
    const { projectId, ticketId } = req.params;
    const membership = await getMembership(projectId, req.user._id);
    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const ticket = await IntakeTicket.findOne({ _id: ticketId, project: projectId });
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const { status, declineReason } = req.body;
    if (status && ['pending_review', 'accepted', 'declined'].includes(status)) {
      ticket.status = status;
      if (status === 'declined' && declineReason) {
        ticket.declineReason = declineReason.trim();
      }
    }
    ticket.reviewedBy = req.user._id;
    ticket.reviewedAt = new Date();

    await ticket.save();

    const populated = await IntakeTicket.findById(ticket._id)
      .populate('reviewedBy', 'name email avatar')
      .populate('convertedToTask', 'title status priority');

    res.json({ success: true, ticket: populated });
  } catch (err) {
    console.error('Update ticket status error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to update ticket' });
  }
};

/**
 * POST /api/projects/:projectId/intake/:ticketId/convert
 * Convert an intake ticket into an active project task. Admin only.
 */
exports.convertTicketToTask = async (req, res) => {
  try {
    const { projectId, ticketId } = req.params;
    const membership = await getMembership(projectId, req.user._id);
    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only admins can convert tickets to tasks' });
    }

    const subCoverage = await verifyProjectSubscription(projectId);
    if (!subCoverage.hasActiveSubscription) {
      return res.status(403).json({
        success: false,
        message: 'An active subscription is required to create tasks.',
        isProjectLocked: true,
      });
    }

    const ticket = await IntakeTicket.findOne({ _id: ticketId, project: projectId });
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const { priority, assignedTo, dueDate, cycle, module, customTitle, customDescription } = req.body;

    const taskTitle = customTitle && customTitle.trim() ? customTitle.trim() : ticket.title;
    const taskDescription = customDescription !== undefined
      ? customDescription
      : `**Client Request from:** ${ticket.clientName} (${ticket.clientEmail})${ticket.company ? ` - ${ticket.company}` : ''}\n\n${ticket.description}`;

    // Normalize assignees
    let assignees = [];
    if (Array.isArray(assignedTo)) {
      assignees = [...new Set(assignedTo.filter(Boolean).map((id) => id.toString()))];
    } else if (assignedTo) {
      assignees = [assignedTo.toString()];
    }

    const task = await Task.create({
      title: taskTitle,
      description: taskDescription,
      project: projectId,
      createdBy: req.user._id,
      assignedTo: assignees,
      status: 'todo',
      priority: priority || ticket.priority || 'medium',
      dueDate: dueDate || null,
      cycle: cycle || null,
      module: module || null,
      comments: [
        {
          user: req.user._id,
          text: `Converted from Client Intake Ticket submitted by ${ticket.clientName} (${ticket.clientEmail})`,
          type: 'activity',
        },
      ],
    });

    ticket.status = 'accepted';
    ticket.convertedToTask = task._id;
    ticket.reviewedBy = req.user._id;
    ticket.reviewedAt = new Date();
    await ticket.save();

    const populatedTask = await Task.findById(task._id)
      .populate('assignedTo', 'name email avatar')
      .populate('createdBy', 'name email avatar')
      .populate('cycle', 'name status')
      .populate('module', 'name status');

    const populatedTicket = await IntakeTicket.findById(ticket._id)
      .populate('reviewedBy', 'name email avatar')
      .populate('convertedToTask', 'title status priority');

    res.status(201).json({
      success: true,
      message: 'Ticket successfully converted to task',
      task: populatedTask,
      ticket: populatedTicket,
    });
  } catch (err) {
    console.error('Convert ticket error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to convert ticket to task' });
  }
};

/**
 * DELETE /api/projects/:projectId/intake/:ticketId
 * Delete an intake ticket. Admin only.
 */
exports.deleteTicket = async (req, res) => {
  try {
    const { projectId, ticketId } = req.params;
    const membership = await getMembership(projectId, req.user._id);
    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    await IntakeTicket.deleteOne({ _id: ticketId, project: projectId });

    res.json({ success: true, message: 'Ticket deleted' });
  } catch (err) {
    console.error('Delete ticket error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete ticket' });
  }
};
