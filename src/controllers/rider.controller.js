const prisma = require("../lib/prisma");
const { sendStatusNotificationEmail } = require("../services/emailService");
const { deliverAndSettle, defaultRiderFee } = require("../services/orderSettlement");


/**
 * Dashboard View
 * Route: GET /api/rider/dashboard
 */
exports.getDashboard = async (req, res) => {
  try {
    const userId = parseInt(req.user.id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user identity format" });
    }

    // 1. Fetch user profile and their specifically accepted active order
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        riderProfile: true,
        riderOrders: {
          where: { 
            status: { in: ['out_for_delivery', 'preparing', 'ready'] } 
          },
          take: 1,
          include: { business: true }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ message: "Rider not found" });
    }

    // 2. Fetch completed orders for TODAY to calculate live earnings
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const completedTodayOrders = await prisma.order.findMany({
      where: {
        riderId: userId,
        status: 'delivered',
        updatedAt: { gte: today }
      }
    });

    // 3. Compute stats dynamically
    const totalEarningsToday = completedTodayOrders.reduce((sum, order) => sum + (order.payout || 0), 0);
    const countCompletedToday = completedTodayOrders.length;

    // 4. Fetch the rider's shift state from the database
    const shift = await prisma.shiftLog.findUnique({
      where: { userId: userId }
    });
    
    const isCurrentlyOnline = shift ? shift.isOnline : false;

    // Formatting placeholder for shift logs (Since traditional columns were dropped during migration)
    const formattedHoursOnline = isCurrentlyOnline ? "Active Shift" : "Offline";

    // 5. Get the last 3 completed deliveries for history list
    const recentDeliveriesRaw = await prisma.order.findMany({
      where: { riderId: userId, status: 'delivered' },
      orderBy: { updatedAt: 'desc' },
      take: 3,
      include: { business: true }
    });

    // ── 6. FIXED RE-ENGINEERED ACTIVE DELIVERY SELECTION ──
    let rawActiveOrder = user.riderOrders[0]; 
    let activeDelivery = null;

    // PIPELINE FALLBACK: If this rider doesn't have an assigned order, 
    // find the oldest unclaimed order that a restaurant broadcasted as 'ready'
    if (!rawActiveOrder) {
      rawActiveOrder = await prisma.order.findFirst({
        where: {
          status: "ready",
          riderId: null, // Means no rider has claimed it yet
          declines: { none: { riderId: userId } } // skip offers this rider declined
        },
        orderBy: { createdAt: "asc" }, // Show oldest available order first
        include: { business: true }
      });
    }

    if (rawActiveOrder) {
      activeDelivery = {
        id: `ORD-${rawActiveOrder.id}`,
        restaurant: rawActiveOrder.business?.name || "Unknown Restaurant",
        customer: rawActiveOrder.customerName,
        dropoff: rawActiveOrder.address || "No address provided",
        payout: `₦${rawActiveOrder.payout?.toLocaleString() || "1,200"}`,
        status: rawActiveOrder.status,
        distance: "3.2 km" // Standard fallback placeholder string
      };
    }

    // ── 7. FIXED: live payload now explicitly includes the user's registry status tracking flags ──
        // ── 7. FIXED WITH ACCOUNT ACCESS LOGIC FOR VERIFIED RIDERS ──
    const dashboardData = {
      isOnline: isCurrentlyOnline, 
      
      //  FIX 1: Updates root status so the frontend opens permissions
      status: (user.status === "verified" || user.status === "active") ? "active" : user.status, 
      
      profile: {
        firstName: user.firstName,
        lastName: user.lastName,
        
        // FIX 2: Updates nested profile status for UI component compatibility
        status: (user.status === "verified" || user.status === "active") ? "active" : user.status, 
        
        vehicleType: user.riderProfile?.vehicleType || "Motorcycle",
        avatarUrl: user.avatarUrl || null,
        isVerified: !!user.riderProfile?.isVerified
      },
      stats: {
        todayEarnings: `₦${totalEarningsToday.toLocaleString()}`,
        completedToday: countCompletedToday,
        hoursOnline: formattedHoursOnline 
      },
      activeDelivery,
      recentDeliveries: recentDeliveriesRaw.map(o => ({
        id: `ORD-${o.id}`,
        payout: `₦${o.payout?.toLocaleString() || 0}`,
        restaurant: o.business?.name || "Restaurant",
        time: o.updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }))
    };


    res.json(dashboardData);
  } catch (error) {
    res.status(500).json({ message: "Failed to load dashboard", error: error.message });
  }
};

/**
 * Shift Actions (Go Online / Go Offline)
 * Route: POST /api/rider/shift/toggle
 */
exports.toggleShift = async (req, res) => {
  try {
    const userId = parseInt(req.user.id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user identity format" });
    }

    const activeShift = await prisma.shiftLog.findUnique({
      where: { userId: userId }
    });

    if (activeShift && activeShift.isOnline) {
      // Toggle offline
      await prisma.shiftLog.update({
        where: { userId: userId },
        data: { isOnline: false }
      });
      return res.json({ status: "offline", message: "Shift ended successfully." });
    } else {
      // Toggle online
      await prisma.shiftLog.upsert({
        where: { userId: userId },
        update: { isOnline: true },
        create: { userId: userId, isOnline: true }
      });
      return res.json({ status: "online", message: "Shift started successfully." });
    }
  } catch (error) {
    res.status(500).json({ message: "Shift toggle failed", error: error.message });
  }
};

/**
 * LIVE TELEMETRY UPDATE ENDPOINT
 * Route: PUT /api/rider/location/ping
 */
exports.updateLiveLocation = async (req, res) => {
  try {
    const userId = parseInt(req.user.id, 10);
    const { latitude, longitude } = req.body;

    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user identity format" });
    }

    if (!latitude || !longitude) {
      return res.status(400).json({ message: "Missing valid latitude or longitude numeric values." });
    }

    const updatedLocation = await prisma.shiftLog.upsert({
      where: { userId: userId },
      update: {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        isOnline: true // Assume active shift state if coordinates are active
      },
      create: {
        userId: userId,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        isOnline: true
      }
    });

    return res.status(200).json({
      success: true,
      message: "Rider geo-coordinates synchronized.",
      coordinates: { lat: updatedLocation.latitude, lng: updatedLocation.longitude }
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to process location ping telemetry", error: error.message });
  }
};

/**
 * Delivery Action (Claim a processing order)
 * Route: PUT /api/rider/orders/:orderId/accept
 */
exports.acceptOrder = async (req, res) => {
  try {
    const userId = parseInt(req.user.id, 10);
    const { orderId } = req.params;

    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user identity format" });
    }

    const activeShift = await prisma.shiftLog.findUnique({
      where: { userId: userId }
    });

    if (!activeShift || !activeShift.isOnline) {
      return res.status(400).json({ message: "You must go online before accepting orders." });
    }

    const rider = await prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
    if (!rider || !["verified", "active"].includes(rider.status)) {
      return res.status(403).json({ message: "Your rider account has not been approved yet." });
    }

    const id = parseInt(orderId, 10);
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    // Atomic claim: only one rider can take a ready, unassigned order.
    const claimed = await prisma.order.updateMany({
      where: { id, riderId: null, status: "ready" },
      data: {
        riderId: userId,
        status: "out_for_delivery",
        ...(order.payout > 0 ? {} : { payout: await defaultRiderFee() })
      }
    });
    if (claimed.count === 0) {
      return res.status(409).json({ message: "This order is no longer available." });
    }
    const updatedOrder = await prisma.order.findUnique({ where: { id } });

    res.json({ message: "Order accepted successfully!", order: updatedOrder });
  } catch (error) {
    res.status(500).json({ message: "Failed to accept order", error: error.message });
  }
};

/**
 * Decline a delivery offer (remembered, so it is not offered to this rider again)
 * Route: POST /rider/orders/:orderId/decline
 */
exports.declineOrder = async (req, res) => {
  try {
    const riderId = parseInt(req.user.id, 10);
    const orderId = parseInt(req.params.orderId, 10);
    if (isNaN(orderId)) {
      return res.status(400).json({ message: "Invalid order id." });
    }

    const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, riderId: true } });
    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }
    if (order.riderId === riderId) {
      return res.status(409).json({ message: "You already accepted this order." });
    }

    await prisma.orderDecline.upsert({
      where: { orderId_riderId: { orderId, riderId } },
      update: {},
      create: { orderId, riderId }
    });
    res.json({ success: true, message: "Offer declined." });
  } catch (error) {
    res.status(500).json({ message: "Failed to decline order", error: error.message });
  }
};

/**
 * Expose drop-off completion endpoint
 * Route: PUT /api/rider/orders/:orderId/complete
 */
exports.completeDelivery = async (req, res) => {
  try {
    const userId = parseInt(req.user.id, 10);
    const { orderId } = req.params;

    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user identity format" });
    }

    const order = await prisma.order.findUnique({
      where: { id: parseInt(orderId, 10) }
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    if (order.riderId !== userId) {
      return res.status(403).json({ message: "You are not authorized to complete this trip assignment." });
    }

    if (order.status !== "out_for_delivery") {
      return res.status(400).json({ message: "Cannot complete an order that is not out for delivery." });
    }

    // Marks delivered and credits wallets exactly once.
    const settled = await deliverAndSettle(order.id, { allowedFrom: ["out_for_delivery"] });
    if (!settled) {
      return res.status(409).json({ message: "This delivery was already completed." });
    }
    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } });

    res.json({ message: "Delivery completed successfully! Earnings locked.", order: updatedOrder });
  } catch (error) {
    res.status(500).json({ message: "Failed to confirm delivery dropoff", error: error.message });
  }
};

/**
 * Profile Update (Handles text data & multer profile images)
 * Route: PUT /api/rider/profile/update
 */
exports.updateRiderProfile = async (req, res) => {
  try {
    const userId = parseInt(req.user.id, 10);
    const { firstName, lastName, phone, vehicleType, plateNumber } = req.body;

    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user identity format" });
    }

    const profileData = {
      ...(vehicleType ? { vehicleType: String(vehicleType).toLowerCase() } : {}),
      ...(plateNumber !== undefined ? { plateNumber: plateNumber || null } : {}),
    };

    const updateData = {
      ...(firstName ? { firstName } : {}),
      ...(lastName ? { lastName } : {}),
      ...(phone ? { phone } : {}),
      ...(Object.keys(profileData).length ? { riderProfile: { update: profileData } } : {}),
    };

    // Profile picture: with Cloudinary storage `path` is the hosted https URL
    // (`filename` is only its public id).
    if (req.file) {
      updateData.avatarUrl = req.file.path;
    }

    if (phone) {
      const existingPhone = await prisma.user.findFirst({
        where: { phone, NOT: { id: userId } }
      });
      if (existingPhone) {
        return res.status(400).json({ message: "Phone number already in use" });
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      include: { riderProfile: true }
    });

    res.json({
      message: "Profile updated successfully!",
      profile: {
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        phone: updatedUser.phone,
        avatarUrl: updatedUser.avatarUrl || null,
        vehicleType: updatedUser.riderProfile?.vehicleType,
        plateNumber: updatedUser.riderProfile?.plateNumber,
        isVerified: updatedUser.riderProfile?.isVerified
      }
    });
  } catch (error) {
    // Full detail goes to the server log; the client only gets a short message
    // (Prisma errors can be thousands of characters long).
    console.error("updateRiderProfile failed:", error);
    res.status(500).json({
      message: "We couldn't save your profile. Please try again, and contact support if it keeps happening.",
    });
  }
};

/**
 * Admin Action: View all system riders
 * Route: GET /api/rider/admin/all
 */
exports.getAllRiders = async (req, res) => {
  try {
    const riders = await prisma.user.findMany({
      where: { role: "rider" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        status: true,
        createdAt: true,
        riderProfile: {
          select: {
            vehicleType: true,
            plateNumber: true,
            idDocumentUrl: true,
          }
        },
        shiftLogs: { select: { isOnline: true } },
        _count: { select: { riderOrders: true } }
      },
      orderBy: { createdAt: "desc" }
    });

    // Flatten the extras so the list screen can show "online now" and delivery counts
    res.json(
      riders.map(({ shiftLogs, _count, ...r }) => ({
        ...r,
        isOnline: !!shiftLogs?.[0]?.isOnline,
        deliveryCount: _count.riderOrders,
      }))
    );
  } catch (error) {
    res.status(500).json({ message: "Failed to retrieve riders", error: error.message });
  }
};

/**
 * Admin Action: Patch status configurations
 * Route: PATCH /api/rider/admin/:id/status
 */
/**
 * Admin Action: Patch status configurations
 * Route: PATCH /api/rider/admin/:id/status
 */
exports.updateRiderStatus = async (req, res) => {
  try {
    const riderId = parseInt(req.params.id, 10);
    const { status } = req.body;

    if (isNaN(riderId)) {
      return res.status(400).json({ message: "Invalid rider identity target parameter." });
    }

    if (!["pending", "verified", "active", "inactive"].includes(status)) {
      return res.status(400).json({ message: "Invalid profile state type assignment" });
    }

    const updatedRider = await prisma.user.update({
      where: { id: riderId },
      data: { 
        status,
        riderProfile: {
          update: {
            isVerified: ["verified", "active"].includes(status)
          }
        }
      },
      // 🚀 FIXED: Added email and firstName fields here so we can read them for the email template
      select: { 
        id: true, 
        status: true,
        email: true,
        firstName: true
      }
    });

    // 🚀 FIRE UNIVERSAL TRANSACTIONAL NOTIFICATION DISPATCH
    // Using .catch() ensures that if Gmail or the SMTP server runs slowly, it won't lag the admin dashboard interface.
    if (updatedRider.email) {
      sendStatusNotificationEmail(updatedRider.email, updatedRider.firstName, status, "rider")
        .catch(err => console.error("Background runner mail session failure:", err));
    }

    res.json({ message: `Rider profile updated to ${status}`, updatedRider });
  } catch (error) {
    res.status(500).json({ message: "Failed to modify rider status tracking flag", error: error.message });
  }
};


/**
 * Admin Action: Reject and drop registration applications
 * Route: DELETE /api/rider/admin/:id
 */
exports.rejectRiderApplication = async (req, res) => {
  try {
    const riderId = parseInt(req.params.id, 10);

    if (isNaN(riderId)) {
      return res.status(400).json({ message: "Invalid rider identity target parameter." });
    }

    const target = await prisma.user.findFirst({
      where: { id: riderId, role: "rider" },
      select: { status: true, _count: { select: { riderOrders: true } } }
    });
    if (!target) {
      return res.status(404).json({ message: "Rider not found." });
    }
    // Only applications still awaiting review can be purged; anyone else keeps their history.
    if (target.status !== "pending" || target._count.riderOrders > 0) {
      return res.status(409).json({
        message: "Only pending applications with no deliveries can be rejected and deleted. Deactivate this rider instead."
      });
    }

    // Cascades and deletes user along with riderProfile due to schema onDelete: Cascade
    await prisma.user.delete({
      where: { id: riderId }
    });

    res.json({ message: "Rider application rejected and account purged successfully." });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete rider registry data record", error: error.message });
  }
};


/**
 * Admin Action: Edit a rider's details
 * Route: PATCH /api/rider/admin/:id
 */
exports.updateRiderByAdmin = async (req, res) => {
  try {
    const riderId = parseInt(req.params.id, 10);
    if (isNaN(riderId)) {
      return res.status(400).json({ message: "Invalid rider identity target parameter." });
    }

    const { firstName, lastName, phone, vehicleType, plateNumber } = req.body;
    const rider = await prisma.user.findFirst({ where: { id: riderId, role: "rider" }, select: { id: true } });
    if (!rider) {
      return res.status(404).json({ message: "Rider not found." });
    }

    if (phone) {
      const taken = await prisma.user.findFirst({ where: { phone, NOT: { id: riderId } }, select: { id: true } });
      if (taken) return res.status(409).json({ message: "Phone number already in use" });
    }

    const profileData = {
      ...(vehicleType != null && { vehicleType }),
      ...(plateNumber !== undefined && { plateNumber: plateNumber || null }),
    };

    const updated = await prisma.user.update({
      where: { id: riderId },
      data: {
        ...(firstName != null && { firstName }),
        ...(lastName != null && { lastName }),
        ...(phone != null && { phone }),
        ...(Object.keys(profileData).length && {
          riderProfile: {
            upsert: {
              update: profileData,
              create: { vehicleType: vehicleType || "motorcycle", idDocumentUrl: "ADMIN_CREATED", ...profileData },
            },
          },
        }),
      },
      select: {
        id: true, firstName: true, lastName: true, email: true, phone: true, status: true,
        riderProfile: { select: { vehicleType: true, plateNumber: true, idDocumentUrl: true } },
      },
    });

    res.json({ message: "Rider updated successfully.", rider: updated });
  } catch (error) {
    res.status(500).json({ message: "Failed to update rider", error: error.message });
  }
};

/**
 * Rider operations alerts (shared by /rider/operations-alerts and /chat/operations-alerts)
 */
exports.getOperationsAlerts = async (req, res) => {
  try {
    const alerts = await prisma.riderAlert.findMany({
      where: { riderId: req.user.id },
      orderBy: { createdAt: "desc" }
    });
    return res.json({ success: true, data: alerts });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
