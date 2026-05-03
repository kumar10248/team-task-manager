const express = require('express');
const router = express.Router();
const project = require('../controllers/project.controller');
const task = require('../controllers/task.controller');
const { protect } = require('../middleware/auth.middleware');

// All project routes require authentication
router.use(protect);

// Project CRUD
router.route('/')
  .get(project.getProjects)
  .post(project.createProject);

router.route('/:id')
  .get(project.getProject)
  .patch(project.updateProject)
  .delete(project.deleteProject);

// Member management
router.route('/:id/members')
  .post(project.addMember);

router.route('/:id/members/:userId')
  .patch(project.updateMemberRole)
  .delete(project.removeMember);

// ── Tasks nested under project ─────────────────────────────────────────────
router.route('/:projectId/tasks')
  .get(task.getTasks)
  .post(task.createTask);

router.route('/:projectId/tasks/:taskId')
  .get(task.getTask)
  .patch(task.updateTask)
  .delete(task.deleteTask);

// Comments
router.route('/:projectId/tasks/:taskId/comments')
  .post(task.addComment);

router.route('/:projectId/tasks/:taskId/comments/:commentId')
  .delete(task.deleteComment);

module.exports = router;