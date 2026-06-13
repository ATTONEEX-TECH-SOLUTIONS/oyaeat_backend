const prisma = require("../lib/prisma");

// Fetch all support chat threads for the logged-in rider
exports.getSupportThreads = async (req, res) => {
  try {
    const userId = parseInt(req.user.id, 10);

    const threads = await prisma.thread.findMany({
      where: {
        type: "support_ticket",
        participants: { some: { id: userId } }
      },
      include: {
        messages: {
          orderBy: { createdAt: "asc" }
        }
      },
      orderBy: { updatedAt: "desc" }
    });

    res.json({ success: true, threads });
  } catch (error) {
    res.status(500).json({ message: "Failed to load chat history", error: error.message });
  }
};

// Dispatch a new response message inside a support ticket thread
exports.sendSupportMessage = async (req, res) => {
  try {
    const userId = parseInt(req.user.id, 10);
    const { threadId, content } = req.body;

    if (!content || !threadId) {
      return res.status(400).json({ message: "Thread identity and text content required" });
    }

    const message = await prisma.message.create({
      data: {
        threadId,
        senderId: userId,
        senderRole: "rider",
        content
      }
    });

    // Sync last message preview text on parent thread
    await prisma.thread.update({
      where: { id: threadId },
      data: { lastMessage: content }
    });

    res.status(201).json({ success: true, message });
  } catch (error) {
    res.status(500).json({ message: "Message dispatch failure", error: error.message });
  }
};
