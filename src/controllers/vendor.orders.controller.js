const prisma = require("../lib/prisma");

const { deliverAndSettle } = require("../services/orderSettlement");

// Statuses a vendor may move an order into, and the statuses each is reachable from.
// out_for_delivery is set only by a rider accepting the order.
const VENDOR_TRANSITIONS = {
  preparing: ["pending"],
  ready: ["pending", "preparing"],
  delivered: ["ready", "out_for_delivery"],
  cancelled: ["pending", "preparing", "ready"],
};

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

    const allowedFrom = VENDOR_TRANSITIONS[status];
    if (!allowedFrom) {
      return res.status(400).json({ success: false, message: `Vendors cannot set status "${status}"` });
    }

    const existing = await prisma.order.findFirst({
      where: { id: orderId, businessId: business.id }
    });
    if (!existing) return res.status(404).json({ success: false, message: "Order not found" });

    if (existing.paymentMethod === "paystack" && existing.paymentStatus !== "paid" && status !== "cancelled") {
      return res.status(402).json({ success: false, message: "Order has not been paid for yet" });
    }

    let order;
    if (status === "delivered") {
      // Status change and wallet credits happen in one transaction, exactly once.
      order = await deliverAndSettle(orderId, { allowedFrom });
    } else {
      const result = await prisma.order.updateMany({
        where: { id: orderId, businessId: business.id, status: { in: allowedFrom } },
        data: { status }
      });
      order = result.count ? await prisma.order.findUnique({ where: { id: orderId } }) : null;
    }

    if (!order) {
      return res.status(409).json({
        success: false,
        message: `Cannot move an order from "${existing.status}" to "${status}"`
      });
    }
    if (status === "delivered") order = await prisma.order.findUnique({ where: { id: orderId } });

    res.json({ success: true, data: { order } });
  } catch (e) {
    res.status(500).json({ success: false, message: "Failed to update order", error: e.message });
  }
};
