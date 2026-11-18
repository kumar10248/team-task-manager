const Doc = require('../models/Doc');
const ProjectMember = require('../models/ProjectMember');
const { verifyProjectSubscription } = require('./subscription.controller');

async function getMembership(projectId, userId) {
  return ProjectMember.findOne({ project: projectId, user: userId });
}

/**
 * POST /api/projects/:projectId/docs
 * Create a new document / spec / wiki page.
 */
exports.createDoc = async (req, res) => {
  try {
    const { projectId } = req.params;
    const membership = await getMembership(projectId, req.user._id);
    if (!membership) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const subCoverage = await verifyProjectSubscription(projectId);
    if (!subCoverage.hasActiveSubscription) {
      return res.status(403).json({
        success: false,
        message: 'An active subscription is required to create documents.',
        isProjectLocked: true,
      });
    }

    const { title, content, isPinned, tags, access } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Document title is required' });
    }

    const doc = await Doc.create({
      title: title.trim(),
      content: content || '',
      project: projectId,
      createdBy: req.user._id,
      lastEditedBy: req.user._id,
      isPinned: Boolean(isPinned),
      tags: Array.isArray(tags) ? tags.map((t) => t.trim().replace(/^#/, '')).filter(Boolean) : [],
      access: access === 'public_view' ? 'public_view' : 'members',
    });

    const populated = await Doc.findById(doc._id)
      .populate('createdBy', 'name email avatar')
      .populate('lastEditedBy', 'name email avatar');

    res.status(201).json({ success: true, doc: populated });
  } catch (err) {
    console.error('Create doc error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to create document' });
  }
};

/**
 * GET /api/projects/:projectId/docs
 * List all docs in a project.
 */
exports.getDocs = async (req, res) => {
  try {
    const { projectId } = req.params;
    const membership = await getMembership(projectId, req.user._id);
    if (!membership) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { search, tag } = req.query;
    const filter = { project: projectId };

    if (tag) {
      filter.tags = tag;
    }

    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { title: { $regex: q, $options: 'i' } },
        { content: { $regex: q, $options: 'i' } },
      ];
    }

    const docs = await Doc.find(filter)
      .populate('createdBy', 'name email avatar')
      .populate('lastEditedBy', 'name email avatar')
      .sort({ isPinned: -1, updatedAt: -1 })
      .lean();

    res.json({ success: true, docs });
  } catch (err) {
    console.error('Get docs error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch documents' });
  }
};

/**
 * GET /api/projects/:projectId/docs/:docId
 * Get a single document by ID.
 */
exports.getDoc = async (req, res) => {
  try {
    const { projectId, docId } = req.params;
    const membership = await getMembership(projectId, req.user._id);
    if (!membership) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const doc = await Doc.findOne({ _id: docId, project: projectId })
      .populate('createdBy', 'name email avatar')
      .populate('lastEditedBy', 'name email avatar')
      .lean();

    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    res.json({ success: true, doc });
  } catch (err) {
    console.error('Get doc error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch document' });
  }
};

/**
 * PATCH /api/projects/:projectId/docs/:docId
 * Update document title, content, tags, pinned status.
 */
exports.updateDoc = async (req, res) => {
  try {
    const { projectId, docId } = req.params;
    const membership = await getMembership(projectId, req.user._id);
    if (!membership) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const subCoverage = await verifyProjectSubscription(projectId);
    if (!subCoverage.hasActiveSubscription) {
      return res.status(403).json({
        success: false,
        message: 'An active subscription is required to edit documents.',
        isProjectLocked: true,
      });
    }

    const doc = await Doc.findOne({ _id: docId, project: projectId });
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    const { title, content, isPinned, tags, access } = req.body;

    if (title !== undefined) doc.title = title.trim();
    if (content !== undefined) doc.content = content;
    if (isPinned !== undefined) doc.isPinned = Boolean(isPinned);
    if (tags !== undefined && Array.isArray(tags)) {
      doc.tags = tags.map((t) => t.trim().replace(/^#/, '')).filter(Boolean);
    }
    if (access !== undefined) {
      doc.access = access === 'public_view' ? 'public_view' : 'members';
    }

    doc.lastEditedBy = req.user._id;
    await doc.save();

    const populated = await Doc.findById(doc._id)
      .populate('createdBy', 'name email avatar')
      .populate('lastEditedBy', 'name email avatar');

    res.json({ success: true, doc: populated });
  } catch (err) {
    console.error('Update doc error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to update document' });
  }
};

/**
 * DELETE /api/projects/:projectId/docs/:docId
 * Delete document.
 */
exports.deleteDoc = async (req, res) => {
  try {
    const { projectId, docId } = req.params;
    const membership = await getMembership(projectId, req.user._id);
    if (!membership) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const doc = await Doc.findOne({ _id: docId, project: projectId });
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    const isAuthor = doc.createdBy.toString() === req.user._id.toString();
    if (membership.role !== 'admin' && !isAuthor) {
      return res.status(403).json({ success: false, message: 'Only admins or the document author can delete this document' });
    }

    await Doc.deleteOne({ _id: docId, project: projectId });

    res.json({ success: true, message: 'Document deleted' });
  } catch (err) {
    console.error('Delete doc error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete document' });
  }
};
