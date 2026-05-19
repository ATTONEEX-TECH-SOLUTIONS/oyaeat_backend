const prisma = require("../lib/prisma");

// Small helper to validate cart and calculate total securely from DB
async function validateOrderInput({ businessId, items }) {
  if (!businessId) {
    throw new Error("businessId is required");
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("items must be a non-empty array");
  }

  const bizId = Number(businessId);

  const business = await prisma.business.findFirst({
    where: { id: bizId, status: "approved" },
    select: { id: true },
  });

  if (!business) {
    throw new Error("Restaurant not found or not approved");
  }

  const quantitiesMap = new Map();
  const menuItemIds = [];

  for (const i of items) {
    const id = Number(i.menuItemId);
    const qty = Number(i.quantity);

    if (!id) {
      throw new Error("Each item must have menuItemId");
    }

    if (!qty || qty <= 0) {
      throw new Error("Each item must have quantity > 0");
    }

    menuItemIds.push(id);
    quantitiesMap.set(id, qty);
  }

  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: menuItemIds }, businessId: bizId, available: true },
    select: { id: true, name: true, price: true },
  });

  if (menuItems.length !== menuItemIds.length) {
    throw new Error(
      "One or more items are invalid/unavailable or do not belong to this restaurant"
    );
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

  return {
    bizId,
    total,
    orderItemsCreate,
  };
}

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

    if (!customerName) {
      return res
        .status(400)
        .json({ success: false, message: "customerName is required" });
    }

    const { bizId, total, orderItemsCreate } = await validateOrderInput({
      businessId,
      items,
    });

    const order = await prisma.order.create({
      data: {
        businessId: bizId,
        customerId: userId,
        customerName,
        customerPhone: customerPhone || null,
        address: address || null,
        paymentMethod: paymentMethod || "cash",
        notes: notes || null,
        status: "pending",
        total,
        paymentStatus: paymentMethod === "cash" ? "pending" : "pending",
        items: { create: orderItemsCreate },
      },
      include: {
        items: true,
        business: { select: { id: true, name: true } },
      },
    });

    res.status(201).json({ success: true, data: { order } });
  } catch (e) {
    const message = e.message || "Failed to create order";

    if (
      message.includes("required") ||
      message.includes("invalid") ||
      message.includes("unavailable") ||
      message.includes("not approved") ||
      message.includes("quantity")
    ) {
      return res.status(400).json({ success: false, message });
    }

    res
      .status(500)
      .json({ success: false, message: "Failed to create order", error: e.message });
  }
};

// POST /orders/initialize-payment
// Body: { businessId, customerName, customerPhone?, address?, email, callbackUrl?, notes?, items: [{ menuItemId, quantity }] }
exports.initializePayment = async (req, res) => {
  try {
    const userId = req.user?.id;

    const {
      businessId,
      customerName,
      customerPhone,
      address,
      email,
      callbackUrl,
      notes,
      items,
    } = req.body;

    if (!customerName) {
      return res
        .status(400)
        .json({ success: false, message: "customerName is required" });
    }

    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "email is required" });
    }

    const { bizId, total, orderItemsCreate } = await validateOrderInput({
      businessId,
      items,
    });

    const order = await prisma.order.create({
      data: {
        businessId: bizId,
        customerId: userId,
        customerName,
        customerPhone: customerPhone || null,
        address: address || null,
        paymentMethod: "paystack",
        notes: notes || null,
        status: "pending",
        total,
        paymentStatus: "pending",
        items: { create: orderItemsCreate },
      },
      include: {
        items: true,
        business: { select: { id: true, name: true } },
      },
    });

    const reference = `order_${order.id}_${Date.now()}`;

    const paystackResponse = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          amount: Math.round(total * 100),
          reference,
          currency: "NGN",
          callback_url: callbackUrl || undefined,
          channels: ["card", "bank_transfer", "ussd", "bank"],
          metadata: {
            orderId: order.id,
            customerId: userId,
            businessId: bizId,
            customerName,
          },
        }),
      }
    );

    const paystackData = await paystackResponse.json();

    if (!paystackData.status) {
      return res.status(400).json({
        success: false,
        message: paystackData.message || "Failed to initialize payment",
      });
    }

    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: {
        paymentReference: reference,
      },
    });

    return res.json({
      success: true,
      data: {
        order: updatedOrder,
        reference,
        authorization_url: paystackData.data.authorization_url,
        access_code: paystackData.data.access_code,
      },
    });
  } catch (e) {
    const message = e.message || "Unable to initialize payment";

    if (
      message.includes("required") ||
      message.includes("invalid") ||
      message.includes("unavailable") ||
      message.includes("not approved") ||
      message.includes("quantity")
    ) {
      return res.status(400).json({ success: false, message });
    }

    return res
      .status(500)
      .json({ success: false, message: "Unable to initialize payment", error: e.message });
  }
};

// GET /orders/verify-payment/:reference
exports.verifyPayment = async (req, res) => {
  try {
    const { reference } = req.params;

    if (!reference) {
      return res.status(400).json({
        success: false,
        message: "reference is required",
      });
    }

    const verifyResponse = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    const verifyData = await verifyResponse.json();

    if (!verifyData.status) {
      return res.status(400).json({
        success: false,
        message: verifyData.message || "Verification failed",
      });
    }

    const tx = verifyData.data;

    if (tx.status !== "success") {
      return res.status(400).json({
        success: false,
        message: `Payment not successful: ${tx.status}`,
        data: tx,
      });
    }

    const orderId = Number(tx.metadata?.orderId);

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Missing orderId in payment metadata",
      });
    }

    const order = await prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: "paid",
        paymentReference: tx.reference,
        paymentChannel: tx.channel || null,
        status: "confirmed",
        paidAt: new Date(),
      },
      include: {
        items: true,
        business: { select: { id: true, name: true } },
      },
    });

    return res.json({
      success: true,
      data: {
        order,
        status: tx.status,
        reference: tx.reference,
        channel: tx.channel || null,
        amount: tx.amount,
      },
    });
  } catch (e) {
    return res
      .status(500)
      .json({ success: false, message: "Unable to verify payment", error: e.message });
  }
};

// GET /orders/my
exports.getMyOrders = async (req, res) => {
  try {
    const userId = req.user?.id;

    const orders = await prisma.order.findMany({
      where: { customerId: userId },
      include: {
        items: {
          include: {
            menuItem: {
              select: { imageUrl: true, imagePublicId: true }
            }
          }
        },
        business: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ success: true, data: { orders } });
  } catch (e) {
    res.status(500).json({ success: false, message: "Failed to fetch orders", error: e.message });
  }
};