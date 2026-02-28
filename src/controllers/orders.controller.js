const prisma = require("../lib/prisma");

// POST /orders
// Body: { businessId, customerName, customerPhone?, address?, paymentMethod?, notes?, items: [{ menuItemId, quantity }] }
exports.createOrder = async (req, res) => {
  try {
    const userId = req.user?.id;

    const {
      businessId,
      customerName,
      customerPhone,
      address,
      paymentMethod,
      notes,
      items,
    } = req.body;

    if (!businessId) return res.status(400).json({ success: false, message: "businessId is required" });
    if (!customerName) return res.status(400).json({ success: false, message: "customerName is required" });
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: "items must be a non-empty array" });
    }

    const bizId = Number(businessId);

    // Only approved restaurants can be ordered
    const business = await prisma.business.findFirst({
      where: { id: bizId, status: "approved" },
      select: { id: true },
    });
    if (!business) {
      return res.status(404).json({ success: false, message: "Restaurant not found or not approved" });
    }

    // Validate quantities + collect ids
    const quantitiesMap = new Map();
    const menuItemIds = [];

    for (const i of items) {
      const id = Number(i.menuItemId);
      const qty = Number(i.quantity);

      if (!id) return res.status(400).json({ success: false, message: "Each item must have menuItemId" });
      if (!qty || qty <= 0) return res.status(400).json({ success: false, message: "Each item must have quantity > 0" });

      menuItemIds.push(id);
      quantitiesMap.set(id, qty);
    }

    // Pull prices from DB (SECURE)
    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: menuItemIds }, businessId: bizId, available: true },
      select: { id: true, name: true, price: true },
    });

    if (menuItems.length !== menuItemIds.length) {
      return res.status(400).json({
        success: false,
        message: "One or more items are invalid/unavailable or do not belong to this restaurant",
      });
    }

    let total = 0;
    const orderItemsCreate = menuItems.map((m) => {
      const quantity = quantitiesMap.get(m.id);
      total += m.price * quantity;

      return {
        menuItemId: m.id,
        name: m.name,
        price: m.price,
        quantity,
      };
    });

    const order = await prisma.order.create({
      data: {
        businessId: bizId,
        customerId: userId,
        customerName,
        customerPhone: customerPhone || null,
        address: address || null,
        paymentMethod: paymentMethod || null,
        notes: notes || null,
        status: "pending",
        total,
        items: { create: orderItemsCreate },
      },
      include: {
        items: true,
        business: { select: { id: true, name: true } },
      },
    });

    res.status(201).json({ success: true, data: { order } });
  } catch (e) {
    res.status(500).json({ success: false, message: "Failed to create order", error: e.message });
  }
};

// GET /orders/my
exports.getMyOrders = async (req, res) => {
  try {
    const userId = req.user?.id;

    const orders = await prisma.order.findMany({
      where: { customerId: userId },
      include: {
        items: true,
        business: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ success: true, data: { orders } });
  } catch (e) {
    res.status(500).json({ success: false, message: "Failed to fetch orders", error: e.message });
  }
};