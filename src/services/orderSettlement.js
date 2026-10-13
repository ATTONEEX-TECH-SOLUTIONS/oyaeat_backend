const prisma = require("../lib/prisma");

const DEFAULT_COMMISSION_PERCENT = 15.0;
const DEFAULT_RIDER_FEE = 1200.0;

async function getNumericSetting(tx, key, fallback) {
  const row = await tx.systemSetting.findUnique({ where: { key } });
  const n = row ? parseFloat(row.value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

async function credit(tx, userId, amount, orderId, description) {
  const wallet = await tx.wallet.upsert({
    where: { userId },
    update: { balance: { increment: amount } },
    create: { userId, balance: amount },
  });
  await tx.walletTransaction.create({
    data: { walletId: wallet.id, amount, type: "credit", status: "completed", description, orderId },
  });
}

/**
 * Marks an order delivered and credits the vendor (and rider) wallets, atomically.
 * Safe to call repeatedly: only the call that actually flips the status to
 * "delivered" credits anything. Returns the updated order, or null if the order
 * was already delivered / cancelled.
 */
async function deliverAndSettle(orderId, { allowedFrom }) {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.order.updateMany({
      where: { id: orderId, status: { in: allowedFrom } },
      data: { status: "delivered" },
    });
    if (claimed.count === 0) return null;

    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { business: { select: { ownerId: true } } },
    });

    // Cash is collected on delivery; online payments were confirmed earlier.
    if (order.paymentStatus !== "paid") {
      await tx.order.update({ where: { id: orderId }, data: { paymentStatus: "paid", paidAt: new Date() } });
    }

    const commission = await getNumericSetting(tx, "fees.platformCommission", DEFAULT_COMMISSION_PERCENT);
    const vendorShare = order.total - order.total * (commission / 100);
    await credit(tx, order.business.ownerId, vendorShare, order.id, `Split Earnings for Order Ref: #${order.id}`);

    if (order.riderId && order.payout > 0) {
      await credit(tx, order.riderId, order.payout, order.id, `Delivery Split Fee for Order Ref: #${order.id}`);
    }
    return order;
  });
}

async function defaultRiderFee() {
  return getNumericSetting(prisma, "fees.baseRiderFee", DEFAULT_RIDER_FEE);
}

module.exports = { deliverAndSettle, defaultRiderFee };
