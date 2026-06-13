const prisma = require("../lib/prisma");

// ── NEW SPLIT PAYMENT ENGINE FUNCTION ──
async function processOrderSplitPayment(orderId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { business: true }
  });

  if (!order) return;

  // 1. Fetch current global admin commission fee rule from settings (fallback to 15% if setting missing)
  const commissionSetting = await prisma.systemSetting.findUnique({
    where: { key: "fees.platformCommission" }
  });
  const adminPercentage = commissionSetting ? parseFloat(commissionSetting.value) : 15.0;

  // 2. Calculate accurate distribution splits
  const adminShare = order.total * (adminPercentage / 100);
  const vendorShare = order.total - adminShare; 
  const riderShare = order.payout || 0.0; // Delivery fee portion

  // 3. Run all database wallet deposits safely inside a database transaction
  await prisma.$transaction([
    // Update Restaurant Vendor Wallet Balance
    prisma.wallet.upsert({
      where: { userId: order.business.ownerId },
      update: { balance: { increment: vendorShare } },
      create: { userId: order.business.ownerId, balance: vendorShare }
    }),
    
    // Log Restaurant Ledger Transaction Entry
    prisma.walletTransaction.create({
      data: {
        walletId: (await prisma.wallet.findUnique({ where: { userId: order.business.ownerId } })).id,
        amount: vendorShare,
        type: "credit",
        status: "completed",
        description: `Split Earnings for Order Ref: #${order.id}`,
        orderId: order.id
      }
    }),

    // Update Logistics Rider Wallet Balance (If a rider is assigned to the order)
    ...(order.riderId ? [
      prisma.wallet.upsert({
        where: { userId: order.riderId },
        update: { balance: { increment: riderShare } },
        create: { userId: order.riderId, balance: riderShare }
      }),
      
      // Log Rider Ledger Transaction Entry
      prisma.walletTransaction.create({
        data: {
          walletId: (await prisma.wallet.findUnique({ where: { userId: order.riderId } })).id,
          amount: riderShare,
          type: "credit",
          status: "completed",
          description: `Delivery Split Fee for Order Ref: #${order.id}`,
          orderId: order.id
        }
      })
    ] : [])
  ]);
}

async function getOwnerBusiness(req) {
  const ownerId = req.user.id;
  return prisma.business.findFirst({
    where: { ownerId },
    select: { id: true, status: true }
  });
}

exports.getOrders = async (req, res) => {
  try {
    const business = await getOwnerBusiness(req);
    if (!business) return res.status(404).json({ success: false, message: "No business found" });

    const { status, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where = { businessId: business.id };
    if (status) where.status = status;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: { items: true },
        orderBy: { createdAt: "desc" },
        skip,
        take: Number(limit)
      }),
      prisma.order.count({ where })
    ]);

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / Number(limit))
        }
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: "Failed to fetch orders", error: e.message });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const business = await getOwnerBusiness(req);
    if (!business) return res.status(404).json({ success: false, message: "No business found" });

    const orderId = parseInt(req.params.orderId);
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, message: "status is required" });
    }

    const existing = await prisma.order.findFirst({
      where: { id: orderId, businessId: business.id }
    });
    if (!existing) return res.status(404).json({ success: false, message: "Order not found" });

    const order = await prisma.order.update({
      where: { id: orderId },
      data: { status }
    });

  
    if (status === "delivered") {
      try {
        await processOrderSplitPayment(orderId);
        console.log(` Split payments successfully distributed for order #${orderId}`);
      } catch (splitError) {
        console.error(` Automated wallet payment split failed for order #${orderId}:`, splitError.message);
        // We log the error but don't crash the main response so the user still sees the status changed successfully
      }
    }

    res.json({ success: true, data: { order } });
  } catch (e) {
    res.status(500).json({ success: false, message: "Failed to update order", error: e.message });
  }
};
