const prisma = require("../lib/prisma");

exports.getRiderEarnings = async (req, res) => {
  try {
    const userId = parseInt(req.user.id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user identity format" });
    }

    // 1. Set dates boundaries
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday

    // 2. Fetch all delivered orders for this rider
    const deliveredOrders = await prisma.order.findMany({
      where: {
        riderId: userId,
        status: "delivered"
      },
      orderBy: { updatedAt: "desc" }
    });

    // 3. Compute structural timeline aggregation variables
    let totalEarningsAllTime = 0;
    let totalEarningsWeek = 0;
    let totalEarningsToday = 0;

    const transactionalLedger = deliveredOrders.map(order => {
      const payoutVal = order.payout || 1200; // Fallback default delivery payout
      const compDate = new Date(order.updatedAt);
      
      totalEarningsAllTime += payoutVal;
      if (compDate >= startOfWeek) totalEarningsWeek += payoutVal;
      if (compDate >= today) totalEarningsToday += payoutVal;

      return {
        id: `TXN-ORD-${order.id}`,
        amount: `₦${payoutVal.toLocaleString()}`,
        type: "credit",
        status: "completed",
        description: "Delivery Payout Credited",
        createdAt: order.updatedAt
      };
    });

    res.json({
      success: true,
      metrics: {
        balance: totalEarningsAllTime, // Total withdrawable money pool
        todayEarnings: `₦${totalEarningsToday.toLocaleString()}`,
        weeklyEarnings: `₦${totalEarningsWeek.toLocaleString()}`,
        pendingPayouts: "₦0"
      },
      transactions: transactionalLedger
    });
  } catch (error) {
    res.status(500).json({ message: "Failed loading ledger distributions", error: error.message });
  }
};
