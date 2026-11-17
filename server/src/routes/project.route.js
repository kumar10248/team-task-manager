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

// Fast single-query user tasks
router.get('/my-tasks', task.getMyTasks);

// Invitations for current user
router.get('/invitations', project.getMyInvitations);
router.post('/invitations/:id/accept', project.acceptInvitation);
router.post('/invitations/:id/decline', project.declineInvitation);

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

// Project custom tags (Case-Insensitive)
router.route('/:id/tags')
  .get(project.getProjectTags)
  .post(project.addProjectTag);

router.route('/:id/tags/:tag')
  .delete(project.deleteProjectTag);

// ── Tasks nested under project ─────────────────────────────────────────────
router.route('/:projectId/tasks')
  .get(task.getTasks)
  .post(task.createTask);

router.route('/:projectId/tasks/:taskId')
  .get(task.getTask)
  .patch(task.updateTask)
  .delete(task.deleteTask);

// Time logs
router.route('/:projectId/tasks/:taskId/time-logs')
  .post(task.logTime);

// Comments
router.route('/:projectId/tasks/:taskId/comments')
  .post(task.addComment);

router.route('/:projectId/tasks/:taskId/comments/:commentId')
  .patch(task.updateComment)
  .delete(task.deleteComment);

module.exports = router;