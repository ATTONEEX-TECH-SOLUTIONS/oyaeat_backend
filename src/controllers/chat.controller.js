const prisma = require('../lib/prisma');
const { getIo } = require('../socket/init');

// Get user's threads
exports.getThreads = async (req, res) => {
  try {
    const userId = req.user.id;
    const threads = await prisma.thread.findMany({
      where: {
        participants: {
          some: { id: userId }
        }
      },
      include: {
        participants: {
          select: { id: true, firstName: true, lastName: true, role: true }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    res.status(200).json({ success: true, data: threads });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Create Support Thread
exports.createSupportThread = async (req, res) => {
  try {
    const userId = req.user.id;
    const { subject, recipientRole } = req.body;

    // Default target is admin
    const targetUser = await prisma.user.findFirst({
      where: { role: 'admin' }
    });

    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'No admin found to receive support ticket' });
    }

    const thread = await prisma.thread.create({
      data: {
        type: 'support_ticket',
        subject: subject,
        participants: {
          connect: [{ id: userId }, { id: targetUser.id }]
        }
      },
      include: { participants: { select: { id: true, role: true } } }
    });

    try {
      getIo().to('role_admin').emit('new_thread', thread);
    } catch (err) {
      console.error('Socket error emitting new_thread:', err);
    }

    res.status(201).json({ success: true, data: thread });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get Messages
exports.getMessages = async (req, res) => {
  try {
    const { threadId } = req.params;
    const messages = await prisma.message.findMany({
      where: { threadId },
      orderBy: { createdAt: 'asc' }
    });

    res.status(200).json({ success: true, data: messages });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Send Message
exports.sendMessage = async (req, res) => {
  try {
    const { threadId } = req.params;
    const { content } = req.body;
    const userId = req.user.id;
    const role = req.user.role;

    const thread = await prisma.thread.findFirst({
      where: {
        id: threadId,
        participants: { some: { id: userId } }
      }
    });

    if (!thread) {
      return res.status(404).json({ success: false, message: 'Thread not found or unauthorized' });
    }

    const message = await prisma.message.create({
      data: {
        threadId,
        senderId: userId,
        senderRole: role,
        content
      }
    });

    await prisma.thread.update({
      where: { id: threadId },
      data: { lastMessage: content, updatedAt: new Date() }
    });

    try {
      getIo().to(`thread_${threadId}`).emit('receive_message', message);
    } catch (err) {
      console.error('Socket error emitting receive_message:', err);
    }

    res.status(201).json({ success: true, data: message });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
