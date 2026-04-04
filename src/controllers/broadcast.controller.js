const prisma = require('../lib/prisma');
const { getIo } = require('../socket/init');

exports.sendBroadcast = async (req, res) => {
  try {
    const { targetRole, subject, content } = req.body;
    const adminId = req.user.id;

    if (!content) {
      return res.status(400).json({ success: false, message: 'Broadcast content is required' });
    }

    const thread = await prisma.thread.create({
      data: {
        type: 'broadcast',
        subject: subject || 'System Broadcast',
      }
    });

    const message = await prisma.message.create({
      data: {
        threadId: thread.id,
        senderId: adminId,
        senderRole: 'admin',
        content,
      }
    });

    const payload = {
      threadId: thread.id,
      subject: thread.subject,
      message: message,
    };

    if (targetRole && targetRole !== 'all') {
      getIo().to(`role_${targetRole}`).emit('broadcast', payload);
    } else {
      getIo().emit('broadcast', payload);
    }

    res.status(200).json({ 
      success: true, 
      data: payload, 
      message: 'Broadcast sent successfully' 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
