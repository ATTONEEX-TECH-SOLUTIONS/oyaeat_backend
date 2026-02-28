const prisma = require("../lib/prisma");

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

    res.json({ success: true, data: { order } });
  } catch (e) {
    res.status(500).json({ success: false, message: "Failed to update order", error: e.message });
  }
};