const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chat.controller');
const requireRole = require('../middlewares/role.middleware');
const authMiddleware = require('../middlewares/auth.middleware');

router.use(authMiddleware);

router.get('/operations-alerts', requireRole('rider'), require('../controllers/rider.controller').getOperationsAlerts);

router.get('/threads', chatController.getThreads);
router.post('/threads', chatController.createSupportThread);
router.get('/threads/:threadId/messages', chatController.getMessages);
router.post('/threads/:threadId/messages', chatController.sendMessage);

router.patch("/threads/:threadId/status", authMiddleware, chatController.toggleThreadStatus);
router.delete("/threads/:threadId", authMiddleware, chatController.deleteThread);


module.exports = router;
