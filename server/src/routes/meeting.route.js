const express = require('express');
const router = express.Router();
const meeting = require('../controllers/meeting.controller');
const { protect } = require('../middleware/auth.middleware');

router.use(protect);

router.get('/', meeting.getMeetings);
router.post('/', meeting.createMeeting);
router.get('/teammates', meeting.getTeammates);
router.get('/:id', meeting.getMeeting);
router.patch('/:id', meeting.updateMeeting);
router.delete('/:id', meeting.deleteMeeting);

module.exports = router;
