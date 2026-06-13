const prisma = require("../lib/prisma");


exports.createSupportThread = async (req, res) => {
  try {
    const { subject, type, targetUserId } = req.body;
    // 💡 Defensively cast to lowercase to match your strict Prisma Enum definitions
    const userRole = req.user.role ? req.user.role.toLowerCase() : ""; 

    if (!subject?.trim()) {
      return res.status(400).json({ success: false, message: "A subject heading is required." });
    }

    // Every thread includes the creator as an initial participant
    const participantConnections = [{ id: parseInt(req.user.id, 10) }];

    // If an admin wants to explicitly attach a specific user to this conversation
    if (userRole === "admin" && targetUserId) {
      participantConnections.push({ id: parseInt(targetUserId, 10) });
    }

    const newThread = await prisma.thread.create({
      data: {
        subject: subject.trim(),
        type: type || "support",
        status: "open",
        lastMessage: "New thread opened.",
        participants: {
          connect: participantConnections
        }
      },
      include: {
        participants: {
          select: { id: true, firstName: true, lastName: true, role: true }
        }
      }
    });

    return res.status(201).json({ success: true, data: newThread });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getThreads = async (req, res) => {
  try {
    const userRole = req.user.role ? req.user.role.toLowerCase() : "";
    const userId = parseInt(req.user.id, 10);
    let queryConditions = {};

    if (userRole !== "admin") {
      queryConditions = {
        participants: { some: { id: userId } }
      };
    }

    const threads = await prisma.thread.findMany({
      where: queryConditions,
      orderBy: { updatedAt: "desc" },
      include: {
        participants: {
          select: { id: true, firstName: true, lastName: true, role: true }
        },
        // 🚀 FETCH THE UNREAD COUNT AND THE LATEST SENDER NAME
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1, // Only get the very last message
          include: {
            sender: { select: { firstName: true, lastName: true } }
          }
        },
        _count: {
          select: {
            messages: {
              where: {
                senderId: { not: userId }, // Messages not sent by the logged-in user
                isRead: false
              }
            }
          }
        }
      }
    });

    // Format data cleanly for the frontend
    const formattedThreads = threads.map(t => ({
      id: t.id,
      type: t.type,
      subject: t.subject,
      status: t.status,
      lastMessage: t.lastMessage,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      participants: t.participants,
      unreadCount: t._count.messages, // 🚀 Attached here
      lastSenderName: t.messages[0]?.sender 
        ? `${t.messages[0].sender.firstName} ${t.messages[0].sender.lastName}`
        : null
    }));

    return res.json({ success: true, data: formattedThreads });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};



exports.getMessages = async (req, res) => {
  try {
    const { threadId } = req.params;
    const userRole = req.user.role ? req.user.role.toLowerCase() : "";
    const userId = parseInt(req.user.id, 10);

    // Security check: Admins bypass, everyone else must be an active participant
    if (userRole !== "admin") {
      const isParticipant = await prisma.thread.findFirst({
        where: {
          id: threadId,
          participants: { some: { id: userId } }
        }
      });

      if (!isParticipant) {
        return res.status(403).json({ success: false, message: "Access Denied: You are not part of this chat thread." });
      }
    }

    const messages = await prisma.message.findMany({
      where: { threadId },
      orderBy: { createdAt: "asc" },
      include: {
        sender: {
          select: { id: true, firstName: true, lastName: true, role: true }
        }
      }
    });

    // Mark messages sent by others as read
    await prisma.message.updateMany({
      where: {
        threadId,
        senderId: { not: userId },
        isRead: false
      },
      data: { isRead: true }
    });

    return res.json({ success: true, data: messages });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};



exports.sendMessage = async (req, res) => {
  try {
    const { threadId } = req.params;
    const { content } = req.body;
    const userRole = req.user.role ? req.user.role.toLowerCase() : "";
    const userId = parseInt(req.user.id, 10);

    if (!content?.trim()) {
      return res.status(400).json({ success: false, message: "Message content cannot be blank." });
    }

    // Security check: Admins can reply anywhere, standard roles must be valid participants
    if (userRole !== "admin") {
      const isParticipant = await prisma.thread.findFirst({
        where: {
          id: threadId,
          participants: { some: { id: userId } }
        }
      });

      if (!isParticipant) {
        return res.status(403).json({ success: false, message: "Access Denied: You cannot post messages to this thread." });
      }
    }

    const newMessage = await prisma.message.create({
      data: {
        content: content.trim(),
        senderRole: req.user.role, // Kept safe for UI label renders
        isRead: false,
        thread: { connect: { id: threadId } },
        sender: { connect: { id: userId } } 
      }
    });

    // Update metadata timestamp on parent conversational tracker
    await prisma.thread.update({
      where: { id: threadId },
      data: { lastMessage: content.trim() }
    });

    return res.status(201).json({ success: true, data: newMessage });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};




/**
 * 🔒 TOGGLE THREAD STATUS (Open / Closed)
 * Accessible by admins to open/close tickets, or regular users to close their own tickets.
 */
exports.toggleThreadStatus = async (req, res) => {
  try {
    const { threadId } = req.params;
    const { status } = req.body; // Expects "open" or "closed"
    const userRole = req.user.role.toLowerCase();
    const userId = parseInt(req.user.id, 10);

    if (!["open", "closed"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status value." });
    }

    // Security check: Non-admins can only toggle status if they belong to the thread
    if (userRole !== "admin") {
      const isParticipant = await prisma.thread.findFirst({
        where: { id: threadId, participants: { some: { id: userId } } }
      });
      if (!isParticipant) {
        return res.status(403).json({ success: false, message: "Unauthorized action." });
      }
    }

    const updatedThread = await prisma.thread.update({
      where: { id: threadId },
      data: { status }
    });

    return res.json({ success: true, data: updatedThread });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};


exports.deleteThread = async (req, res) => {
  try {
    const { threadId } = req.params;
    const userRole = req.user.role ? req.user.role.toLowerCase() : "";

    // 🚀 BACKEND LOCK: Block riders, owners, and customers instantly
    if (userRole !== "admin") {
      return res.status(403).json({ 
        success: false, 
        message: "Access Denied: Only administrators can permanently destroy records." 
      });
    }

    await prisma.thread.delete({
      where: { id: threadId }
    });

    return res.json({ success: true, message: "Thread permanently deleted successfully." });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};


