const prisma = require("../lib/prisma");

const naira = (n) => `₦${Math.round(n).toLocaleString()}`;

// GET /rider/earnings/summary
// Reads the rider's wallet, the same source as /api/wallet/summary, so the figures
// agree with what the rider can actually withdraw.
exports.getRiderEarnings = async (req, res) => {
  try {
    const userId = parseInt(req.user.id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user identity format" });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday

    const wallet = await prisma.wallet.findUnique({
      where: { userId },
      include: { transactions: { orderBy: { createdAt: "desc" } } },
    });

    const transactions = wallet?.transactions ?? [];
    let totalEarningsWeek = 0;
    let totalEarningsToday = 0;

    // Earnings are completed credits; withdrawals and payouts are debits and don't count.
    for (const t of transactions) {
      if (t.type !== "credit" || t.status !== "completed") continue;
      const when = new Date(t.createdAt);
      if (when >= startOfWeek) totalEarningsWeek += t.amount;
      if (when >= today) totalEarningsToday += t.amount;
    }

    res.json({
      success: true,
      metrics: {
        balance: wallet?.balance ?? 0, // withdrawable money
        todayEarnings: naira(totalEarningsToday),
        weeklyEarnings: naira(totalEarningsWeek),
        pendingPayouts: naira(wallet?.pendingPayouts ?? 0),
      },
      transactions: transactions.map((t) => ({
        id: t.id,
        amount: naira(t.amount),
        type: t.type,
        status: t.status,
        description: t.description,
        createdAt: t.createdAt,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: "Failed loading ledger distributions", error: error.message });
  }
};
