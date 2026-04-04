const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chat.controller');
const authMiddleware = require('../middlewares/auth.middleware');

router.use(authMiddleware);

router.get('/threads', chatController.getThreads);
router.post('/threads', chatController.createSupportThread);
router.get('/threads/:threadId/messages', chatController.getMessages);
router.post('/threads/:threadId/messages', chatController.sendMessage);

module.exports = router;
