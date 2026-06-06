const prisma = require("../lib/prisma");
const { getIO } = require("../socket/init");
const paystack = require('paystack-api')(process.env.PAYSTACK_SECRET_KEY); 

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

    // Validate incoming order payloads safely
    const { bizId, total, orderItemsCreate } = await validateOrderInput({
      businessId,
      items,
    });

    // Save baseline metadata details into your original Order schema rows safely
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

    // ── FIXED PIPELINE: Native SDK handles Cloudflare headers automatically ──
    let paystackData;
    try {
      const paystackResponse = await paystack.transaction.initialize({
        email,
        amount: Math.round(total * 100), // Converted cleanly to kobo matching Paystack configurations
        reference,
        currency: "NGN",
        callback_url: callbackUrl || undefined,
        channels: ["card", "bank_transfer", "ussd", "bank"],
        metadata: {
          orderId: order.id,
          customerId: userId,
          businessId: bizId,
          customerName,
          customerLatitude: req.body.customerLatitude || null,
          customerLongitude: req.body.customerLongitude || null
        },
      });

      paystackData = paystackResponse;
    } catch (paystackError) {
      console.error("Paystack SDK communication fault:", paystackError.message);
      return res.status(400).json({
        success: false,
        message: paystackError.message || "Failed to initialize payment transaction window.",
      });
    }

    if (!paystackData.status) {
      return res.status(400).json({
        success: false,
        message: paystackData.message || "Failed to initialize payment transaction window.",
      });
    }

    // Save transaction reference string securely
    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: {
        paymentReference: reference,
      },
    });

    // Return structured metadata to client application router safely
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
    console.error("Critical payment breakdown exception:", e.message);
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
      .json({ success: false, message: "Unable to initialize payment pipeline", error: e.message });
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

// ── NEW PROXIMITY DISPATCH ENGINE HELPER ──
// Runs a spherical radius circle lookup centering the targeted restaurant ID
async function findNearbyAvailableRiders(businessId, radiusInKm = 5.0) {
  const restaurant = await prisma.business.findUnique({
    where: { id: businessId },
    select: { latitude: true, longitude: true }
  });

  if (!restaurant || !restaurant.latitude || !restaurant.longitude) {
    return []; // Gracefully fail if target restaurant lacks coordinate maps
  }

  const { latitude: restLat, longitude: restLng } = restaurant;

  // 6371 represents planet Earth's radius in kilometers
  const nearbyRiders = await prisma.$queryRaw`
    SELECT 
      sl."userId" as "riderId",
      u."firstName",
      u."lastName",
      u."phone",
      sl.latitude,
      sl.longitude,
      (6371 * acos(
        cos(radians(${restLat})) * cos(radians(sl.latitude)) * 
        cos(radians(sl.longitude) - radians(${restLng})) + 
        sin(radians(${restLat})) * sin(radians(sl.latitude))
      )) AS distance
    FROM "ShiftLog" sl
    JOIN "User" u ON sl."userId" = u.id
    WHERE u.role = 'rider' 
      AND sl."isOnline" = true
      AND sl.latitude IS NOT NULL 
      AND sl.longitude IS NOT NULL
      AND (6371 * acos(
        cos(radians(${restLat})) * cos(radians(sl.latitude)) * 
        cos(radians(sl.longitude) - radians(${restLng})) + 
        sin(radians(${restLat})) * sin(radians(sl.latitude))
      )) <= ${radiusInKm}
    ORDER BY distance ASC;
  `;

  return nearbyRiders;
}

// ── NEW PROXIMITY DISPATCH ROUTE ACTION ──
// POST /orders/:id/dispatch
exports.dispatchOrderToRiders = async (req, res) => {
  const orderId = parseInt(req.params.id, 10);

  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { business: { select: { name: true } } } // Pull restaurant name for alert toast
    });

    if (!order) {
      return res.status(404).json({ success: false, message: "Order record not found" });
    }

    // Identify nearby riders located inside a 5km operational ring
    const eligibleRiders = await findNearbyAvailableRiders(order.businessId, 5.0);

    // ── NEW LIVE SOCKET BROADCAST LOOPS ──
    const ioInstance = getIO();

    eligibleRiders.forEach((rider) => {
      console.log(`🎯 Dispatching live push to Rider #${rider.riderId} (${rider.firstName})`);
      
      // Target rider's private room instantly
      ioInstance.to(`rider_${rider.riderId}`).emit("NEW_DELIVERY_REQUEST", {
        orderId: order.id,
        restaurantName: order.business?.name || "Partner Kitchen",
        payout: order.payout || 1200,
        distance: `${rider.distance.toFixed(1)} km`,
        dropoffAddress: order.address || "Customer Doorstep"
      });
    });

    return res.status(200).json({
      success: true,
      message: "Proximity scanning radius check successfully processed and pushed via socket.",
      notifiedRidersCount: eligibleRiders.length,
      data: { riders: eligibleRiders }
    });

  } catch (error) {
    console.error("Critical logistics matching query failure:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Internal proximity distribution module failure", 
      error: error.message 
    });
  }
};

exports.getCustomerRiderTracking = async (req, res) => {
  const orderId = parseInt(req.params.id, 10);

  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        status: true,
        riderId: true,
        rider: {
          select: {
            firstName: true,
            lastName: true,
            shiftLogs: {
              select: { latitude: true, longitude: true, isOnline: true }
            }
          }
        }
      }
    });

    if (!order || !order.riderId || !order.rider.shiftLogs[0]) {
      return res.status(200).json({ message: "No active rider assigned yet or tracking is offline." });
    }

    const shiftData = order.rider.shiftLogs[0];

    return res.status(200).json({
      riderName: `${order.rider.firstName} ${order.rider.lastName}`,
      latitude: shiftData.latitude,
      longitude: shiftData.longitude,
      status: order.status
    });

  } catch (error) {
    console.error("Customer position tracker query error:", error);
    return res.status(500).json({ message: "Failed to pull rider tracking updates", error: error.message });
  }
};
