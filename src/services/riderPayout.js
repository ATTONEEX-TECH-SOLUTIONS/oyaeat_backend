const prisma = require("../lib/prisma");
const { initiateTransfer } = require("./paystackSplit");

const autoEnabled = () => String(process.env.RIDER_AUTO_TRANSFER ?? "true").toLowerCase() !== "false";
const AUTO_PREFIX = "Automatic delivery payout";

/**
 * After an order is delivered (and the rider's wallet credited), send the delivery fee
 * to the rider's bank through Paystack. The wallet stays the ledger: the amount is
 * moved to "pending payout" first, and put back if Paystack refuses or the transfer
 * later fails, so the rider can still withdraw it manually. Never throws.
 */
async function payRiderForOrder(orderId) {
  try {
    if (!autoEnabled()) return null;
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order?.riderId || !(order.payout > 0)) return null;

    const profile = await prisma.riderProfile.findUnique({ where: { userId: order.riderId } });
    if (!profile?.paystackRecipientCode) return null; // no payout account yet: stays in the wallet

    // Reserve the money and create the ledger row once per order.
    const entry = await prisma.$transaction(async (tx) => {
      const already = await tx.walletTransaction.findFirst({
        where: { orderId, description: { startsWith: AUTO_PREFIX }, status: { in: ["pending", "completed"] } },
      });
      if (already) return null;
      const wallet = await tx.wallet.findUnique({ where: { userId: order.riderId } });
      if (!wallet) return null;
      const reserved = await tx.wallet.updateMany({
        where: { id: wallet.id, balance: { gte: order.payout } },
        data: { balance: { decrement: order.payout }, pendingPayouts: { increment: order.payout } },
      });
      if (reserved.count === 0) return null;
      return tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amount: order.payout,
          type: "debit",
          status: "pending",
          description: `${AUTO_PREFIX} for Order Ref: #${orderId}`,
          orderId,
        },
      });
    });
    if (!entry) return null;

    try {
      const t = await initiateTransfer({
        amountKobo: Math.round(order.payout * 100),
        recipient: profile.paystackRecipientCode,
        reference: entry.id, // uuid: unique, 36 chars, valid Paystack reference
        reason: `OyaEat delivery #${orderId}`,
      });
      // "otp" means the Paystack account still requires OTP approval for transfers: treat as not sent.
      if (t.status === "otp") throw new Error("Paystack requires OTP approval for transfers (disable it in Paystack settings)");
      return entry;
    } catch (e) {
      console.error(`Rider auto-transfer failed for order ${orderId}:`, e.message);
      await failPayout(entry.id);
      return null;
    }
  } catch (e) {
    console.error("payRiderForOrder error:", e.message);
    return null;
  }
}

/** Marks a pending automatic payout failed and returns the money to the rider's wallet. */
async function failPayout(entryId) {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.walletTransaction.updateMany({
      where: { id: entryId, status: "pending", type: "debit", description: { startsWith: AUTO_PREFIX } },
      data: { status: "failed" },
    });
    if (claimed.count === 0) return false;
    const entry = await tx.walletTransaction.findUnique({ where: { id: entryId } });
    await tx.wallet.update({
      where: { id: entry.walletId },
      data: { balance: { increment: entry.amount }, pendingPayouts: { decrement: entry.amount } },
    });
    return true;
  });
}

async function completePayout(entryId) {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.walletTransaction.updateMany({
      where: { id: entryId, status: "pending", type: "debit", description: { startsWith: AUTO_PREFIX } },
      data: { status: "completed" },
    });
    if (claimed.count === 0) return false;
    const entry = await tx.walletTransaction.findUnique({ where: { id: entryId } });
    await tx.wallet.update({ where: { id: entry.walletId }, data: { pendingPayouts: { decrement: entry.amount } } });
    return true;
  });
}

/** Handles Paystack's transfer.* webhook events. */
async function handleTransferEvent(event) {
  const reference = event?.data?.reference;
  if (!reference) return;
  if (event.event === "transfer.success") await completePayout(reference);
  else if (event.event === "transfer.failed" || event.event === "transfer.reversed") await failPayout(reference);
}

module.exports = { payRiderForOrder, handleTransferEvent, AUTO_PREFIX };
