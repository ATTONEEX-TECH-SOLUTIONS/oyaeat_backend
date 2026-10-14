const prisma = require("../lib/prisma");

/**
 * Marks an online-paid order as paid, once. Checks that Paystack was paid the
 * order's full amount. Safe to call from both the customer's "verify" call and
 * the Paystack webhook: whichever arrives second changes nothing.
 * Returns the order, or null if the amount did not match.
 */
async function markOrderPaid(orderId, tx) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return null;
  if (order.paymentStatus === "paid") return order;

  if (Math.round(order.total * 100) !== Number(tx.amount)) return null;

  await prisma.order.updateMany({
    where: { id: orderId, paymentStatus: { not: "paid" } },
    data: {
      paymentStatus: "paid",
      paymentReference: tx.reference,
      paymentChannel: tx.channel || null,
      paidAt: new Date(),
    },
  });
  return prisma.order.findUnique({ where: { id: orderId } });
}

module.exports = { markOrderPaid };
