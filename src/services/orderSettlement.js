const prisma = require("../lib/prisma");
const { payRiderForOrder } = require("./riderPayout");

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

// Records money the restaurant owes the platform (negative wallet balance).
async function debitOwed(tx, userId, amount, orderId, description) {
  const wallet = await tx.wallet.upsert({
    where: { userId },
    update: { balance: { decrement: amount } },
    create: { userId, balance: -amount },
  });
  await tx.walletTransaction.create({
    data: { walletId: wallet.id, amount, type: "debit", status: "completed", description, orderId },
  });
}

/**
 * Marks an order delivered and credits the vendor (and rider) wallets, atomically.
 * Safe to call repeatedly: only the call that actually flips the status to
 * "delivered" credits anything. Returns the updated order, or null if the order
 * was already delivered / cancelled.
 */
async function deliverAndSettle(orderId, { allowedFrom }) {
  const settled = await prisma.$transaction(async (tx) => {
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

    // The delivery fee belongs to the platform; commission and the restaurant's share are on the food only.
    const deliveryFee = order.deliveryFee ?? 0;
    const food = order.total - deliveryFee;

    if (order.settlementMode === "split") {
      // The restaurant's share already went straight to its bank via Paystack.
    } else if (order.paymentMethod === "paystack") {
      // Paid online before restaurants had payment accounts: platform holds the money, so credit the restaurant's wallet.
      const commission = await getNumericSetting(tx, "fees.platformCommission", DEFAULT_COMMISSION_PERCENT);
      const vendorShare = food - food * (commission / 100);
      await credit(tx, order.business.ownerId, vendorShare, order.id, `Split Earnings for Order Ref: #${order.id}`);
    } else {
      // Cash order: the restaurant keeps the cash, so it owes the platform its commission
      // plus the delivery fee, which the platform pays on to the rider.
      const bank = await tx.businessBankDetail.findUnique({ where: { businessId: order.businessId } });
      const commission =
        bank?.commissionPercent ?? (await getNumericSetting(tx, "fees.platformCommission", DEFAULT_COMMISSION_PERCENT));
      const owed = Math.round(food * commission) / 100 + deliveryFee;
      if (owed > 0) await debitOwed(tx, order.business.ownerId, owed, order.id, `Commission and delivery fee owed on cash order #${order.id}`);
    }

    if (order.riderId && order.payout > 0) {
      await credit(tx, order.riderId, order.payout, order.id, `Delivery Split Fee for Order Ref: #${order.id}`);
    }
    return order;
  });
  // Outside the transaction: a slow or failed transfer must never undo the delivery.
  if (settled) await payRiderForOrder(orderId);
  return settled;
}

async function defaultRiderFee() {
  return getNumericSetting(prisma, "fees.baseRiderFee", DEFAULT_RIDER_FEE);
}

module.exports = { deliverAndSettle, defaultRiderFee };
