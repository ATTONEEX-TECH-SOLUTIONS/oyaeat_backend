const prisma = require("../lib/prisma");


exports.createSupportThread = async (req, res) => {
  try {
    const { subject, type } = req.body;
    if (!subject?.trim()) {
      return res.status(400).json({ success: false, message: "A subject heading is required." });
    }

    const newThread = await prisma.thread.create({
      data: {
        subject: subject.trim(),
        type: type || "support",
        status: "open",
        lastMessage: "New thread opened.",
        participants: {
          // 🚀 Connects the user and captures both their specific ID and Role context
          connect: { id: req.user.id } 
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



/**
 * 📢 FETCH ALL CONVERSATIONS / THREADS LIST
 * 🔐 FIXED: Enforces strict user ID and user role matching criteria to prevent cross-account leaks
 */
exports.getThreads = async (req, res) => {
  try {
    const userRole = req.user.role.toLowerCase();
    let queryConditions = {};

    // 1. SuperAdmins can see everything system-wide
    // 2. Customers, Vendors, and Riders only see threads where their unique ID AND Role match perfectly
    if (userRole !== "admin") {
      queryConditions = {
        participants: {
          some: {
            id: req.user.id,
            role: req.user.role // 🚀 CRITICAL FIX: Verifies role to isolate accounts sharing the same ID numbers
          }
        }
      };
    }

    const threads = await prisma.thread.findMany({
      where: queryConditions,
      orderBy: { updatedAt: "desc" },
      include: {
        participants: {
          select: { id: true, firstName: true, lastName: true, role: true }
        }
      }
    });

    return res.json({ success: true, data: threads });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};




exports.getMessages = async (req, res) => {
  try {
    const { threadId } = req.params;

    const messages = await prisma.message.findMany({
      where: { threadId },
      orderBy: { createdAt: "asc" },
      include: {
        sender: {
          select: { id: true, firstName: true, lastName: true, role: true }
        },
        thread: {
          include: {
            participants: {
              select: { id: true, firstName: true, lastName: true, role: true }
            }
          }
        }
      }
    });

    // Mark incoming messages as read
    await prisma.message.updateMany({
      where: {
        threadId,
        senderId: { not: req.user.id },
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

    if (!content?.trim()) {
      return res.status(400).json({ success: false, message: "Message content cannot be blank." });
    }

    const newMessage = await prisma.message.create({
      data: {
        content: content.trim(),
        senderRole: req.user.role,
        isRead: false,
        thread: { connect: { id: threadId } },
        sender: { connect: { id: req.user.id } } 
      }
    });

    await prisma.thread.update({
      where: { id: threadId },
      data: { lastMessage: content.trim() }
    });

    return res.status(201).json({ success: true, data: newMessage });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
