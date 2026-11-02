const Meeting = require('../models/Meeting');
const ProjectMember = require('../models/ProjectMember');
const { createNotification } = require('./notification.controller');

/**
 * GET /api/meetings
 * List meetings relevant to the authenticated user.
 * Query params: projectId, status, scope ('upcoming' | 'past' | 'all')
 */
exports.getMeetings = async (req, res) => {
  try {
    const memberships = await ProjectMember.find({ user: req.user._id }).lean();
    const projectIds = memberships.map((m) => m.project);

    const baseFilter = {
      $or: [
        { createdBy: req.user._id },
        { participants: req.user._id },
        { project: { $in: projectIds } },
      ],
    };

    if (req.query.projectId) {
      baseFilter.project = req.query.projectId;
    }

    const now = new Date();

    if (req.query.scope === 'upcoming') {
      baseFilter.endTime = { $gte: now };
      baseFilter.status = { $ne: 'cancelled' };
    } else if (req.query.scope === 'past') {
      baseFilter.endTime = { $lt: now };
    }

    if (req.query.status) {
      baseFilter.status = req.query.status;
    }

    const meetings = await Meeting.find(baseFilter)
      .populate('createdBy', 'name email avatar')
      .populate('participants', 'name email avatar')
      .populate('project', 'name color')
      .sort({ startTime: req.query.scope === 'past' ? -1 : 1 })
      .lean();

    // Dynamically mark ongoing if within time window and still marked scheduled
    const updated = meetings.map((m) => {
      const start = new Date(m.startTime);
      const end = new Date(m.endTime);
      let dynamicStatus = m.status;
      if (m.status === 'scheduled') {
        if (now >= start && now <= end) {
          dynamicStatus = 'ongoing';
        } else if (now > end) {
          dynamicStatus = 'completed';
        }
      }
      return {
        ...m,
        status: dynamicStatus,
      };
    });

    res.json({ success: true, meetings: updated });
  } catch (err) {
    console.error('Failed to fetch meetings:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch meetings' });
  }
};

/**
 * POST /api/meetings
 * Create a new meeting.
 */
exports.createMeeting = async (req, res) => {
  try {
    const { title, description, project, participants, startTime, endTime, meetLink, agenda } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Meeting title is required' });
    }
    if (!startTime || !endTime) {
      return res.status(400).json({ success: false, message: 'Start and end time are required' });
    }

    let finalLink = (meetLink || '').trim();
    if (!finalLink) {
      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .slice(0, 16);
      finalLink = `https://meet.jit.si/taskforge-${slug}-${Date.now().toString(36)}`;
    }

    const meeting = await Meeting.create({
      title: title.trim(),
      description: description || '',
      project: project || null,
      createdBy: req.user._id,
      participants: Array.isArray(participants) ? participants : [],
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      meetLink: finalLink,
      agenda: Array.isArray(agenda) ? agenda : [],
    });

    const populated = await Meeting.findById(meeting._id)
      .populate('createdBy', 'name email avatar')
      .populate('participants', 'name email avatar')
      .populate('project', 'name color');

    // Notify participants
    if (Array.isArray(participants)) {
      participants.forEach((uid) => {
        if (uid && uid.toString() !== req.user._id.toString()) {
          createNotification({
            recipient: uid,
            sender: req.user._id,
            type: 'system',
            project: project || undefined,
            text: `scheduled meeting "${title}" for ${new Date(startTime).toLocaleString()}`,
          });
        }
      });
    }

    res.status(201).json({ success: true, meeting: populated });
  } catch (err) {
    console.error('Failed to create meeting:', err);
    res.status(500).json({ success: false, message: 'Failed to create meeting' });
  }
};

/**
 * GET /api/meetings/:id
 * Get single meeting details.
 */
exports.getMeeting = async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id)
      .populate('createdBy', 'name email avatar')
      .populate('participants', 'name email avatar')
      .populate('project', 'name color');

    if (!meeting) {
      return res.status(404).json({ success: false, message: 'Meeting not found' });
    }

    res.json({ success: true, meeting });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch meeting' });
  }
};

/**
 * PATCH /api/meetings/:id
 * Update meeting details or agenda items.
 */
exports.updateMeeting = async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) {
      return res.status(404).json({ success: false, message: 'Meeting not found' });
    }

    const allowed = ['title', 'description', 'startTime', 'endTime', 'meetLink', 'status', 'agenda', 'participants'];
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) {
        meeting[field] = req.body[field];
      }
    });

    await meeting.save();

    const populated = await Meeting.findById(meeting._id)
      .populate('createdBy', 'name email avatar')
      .populate('participants', 'name email avatar')
      .populate('project', 'name color');

    res.json({ success: true, meeting: populated });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update meeting' });
  }
};

/**
 * DELETE /api/meetings/:id
 * Delete / cancel a meeting.
 */
exports.deleteMeeting = async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) {
      return res.status(404).json({ success: false, message: 'Meeting not found' });
    }

    await Meeting.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Meeting deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete meeting' });
  }
};
