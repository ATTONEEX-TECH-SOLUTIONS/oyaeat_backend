const prisma = require("../lib/prisma");

const round2 = (n) => Math.round((n || 0) * 100) / 100;

// GET /vendor/earnings?page&limit
// What the restaurant earned, what OyaEat kept, and what is owed on cash orders.
exports.getEarnings = async (req, res) => {
  try {
    const business = await prisma.business.findFirst({
      where: { ownerId: req.user.id },
      select: { id: true, bankDetail: true },
    });
    if (!business) return res.status(404).json({ success: false, message: "No business found" });

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 15));
    const bank = business.bankDetail;
    const paidOnline = { settlementMode: "split", paymentStatus: "paid", status: { not: "cancelled" } };
    const where = { businessId: business.id, OR: [paidOnline, { status: "delivered" }] };

    const [orders, total, online, wallet] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, createdAt: true, status: true, paymentMethod: true, settlementMode: true,
          total: true, platformFee: true, restaurantShare: true,
        },
      }),
      prisma.order.count({ where }),
      prisma.order.aggregate({ where: { businessId: business.id, ...paidOnline }, _sum: { platformFee: true, restaurantShare: true, total: true } }),
      prisma.wallet.findUnique({ where: { userId: req.user.id } }),
    ]);

    // Per-order amounts for orders that did not use a split (cash, or paid before the account existed).
    const ledger = await prisma.walletTransaction.findMany({
      where: { orderId: { in: orders.map((o) => o.id) }, walletId: wallet?.id ?? -1 },
      select: { orderId: true, type: true, amount: true },
    });
    const byOrder = new Map(ledger.map((l) => [l.orderId, l]));

    const rows = orders.map((o) => {
      const l = byOrder.get(o.id);
      if (o.settlementMode === "split") {
        return { id: o.id, createdAt: o.createdAt, status: o.status, mode: "online", total: o.total, platformFee: o.platformFee, youReceive: o.restaurantShare, note: "Paid to your bank by Paystack" };
      }
      if (o.paymentMethod === "paystack") {
        return { id: o.id, createdAt: o.createdAt, status: o.status, mode: "wallet", total: o.total, platformFee: l ? round2(o.total - l.amount) : null, youReceive: l?.amount ?? null, note: "Added to your wallet balance" };
      }
      return { id: o.id, createdAt: o.createdAt, status: o.status, mode: "cash", total: o.total, platformFee: l?.amount ?? null, youReceive: l ? round2(o.total - l.amount) : null, note: "Paid to you in cash. You owe OyaEat the fee" };
    });

    const balance = wallet?.balance ?? 0;
    res.json({
      success: true,
      data: {
        account: bank?.paystackSubaccountCode
          ? { bankName: bank.bankName, accountName: bank.accountName, accountNumber: bank.accountNumber, active: bank.subaccountActive }
          : null,
        summary: {
          paidToBank: round2(online._sum.restaurantShare),
          platformFees: round2(online._sum.platformFee),
          onlineSales: round2(online._sum.total),
          cashOwed: balance < 0 ? round2(-balance) : 0,
          walletBalance: balance > 0 ? round2(balance) : 0,
          pendingPayouts: round2(wallet?.pendingPayouts),
        },
        orders: rows,
        pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (e) {
    console.error("getEarnings failed:", e);
    res.status(500).json({ success: false, message: "Failed to load earnings" });
  }
};
