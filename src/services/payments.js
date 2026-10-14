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

const PAYSTACK_BASE = () => process.env.PAYSTACK_BASE_URL || "https://api.paystack.co";
const ATTEMPT_TIMEOUT_MS = 12000;
const ATTEMPTS = 2;

class PaystackUnreachableError extends Error {
  constructor(cause) {
    super("We couldn't reach Paystack just now. Check your internet connection and try again.");
    this.name = "PaystackUnreachableError";
    this.cause = cause;
  }
}

/**
 * Starts a Paystack transaction. A dropped connection, TLS failure or timeout is
 * retried once before giving up (throws PaystackUnreachableError). A reply from
 * Paystack, even a refusal, is returned as-is for the caller to interpret.
 */
async function initializeTransaction(payload) {
  let lastError;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${PAYSTACK_BASE()}/transaction/initialize`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      });
      return await res.json();
    } catch (e) {
      lastError = e;
      console.error(`Paystack initialize attempt ${attempt}/${ATTEMPTS} failed:`, e.cause?.message || e.message);
      if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, 800));
    }
  }
  throw new PaystackUnreachableError(lastError);
}

module.exports = { markOrderPaid, initializeTransaction, PaystackUnreachableError };
