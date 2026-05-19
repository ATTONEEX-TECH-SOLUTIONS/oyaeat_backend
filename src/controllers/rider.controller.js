const prisma = require("../lib/prisma");



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

    // 4. Fetch all shifts starting from today to calculate real hours online
    const todayShifts = await prisma.shiftLog.findMany({
      where: {
        riderId: userId,
        startTime: { gte: today }
      }
    });

    // Check if the rider has an ongoing open shift right now
    const currentActiveShift = todayShifts.find(shift => shift.endTime === null);
    const isCurrentlyOnline = !!currentActiveShift;

    // Calculate total duration in milliseconds
    let totalMsToday = 0;
    todayShifts.forEach(shift => {
      const start = new Date(shift.startTime).getTime();
      const end = shift.endTime ? new Date(shift.endTime).getTime() : Date.now();
      totalMsToday += (end - start);
    });

    // Turn total milliseconds into formatted string (e.g., "4h 12m")
    const totalMinutes = Math.floor(totalMsToday / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const formattedHoursOnline = `${hours}h ${minutes}m`;

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
          riderId: null // Means no rider has claimed it yet
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

    // 7. Build the live final payload with real status tracking variables
    const dashboardData = {
      isOnline: isCurrentlyOnline, 
      profile: {
        firstName: user.firstName,
        lastName: user.lastName,
        vehicleType: user.riderProfile?.vehicleType || "Motorcycle"
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

// ... keep your toggleShift and acceptOrder logic matching below unchanged

exports.toggleShift = async (req, res) => {
  try {
    const userId = parseInt(req.user.id, 10);

    const activeShift = await prisma.shiftLog.findFirst({
      where: {
        riderId: userId,
        endTime: null
      }
    });

    if (activeShift) {
      await prisma.shiftLog.update({
        where: { id: activeShift.id },
        data: { endTime: new Date() }
      });
      return res.json({ status: "offline", message: "Shift ended successfully." });
    } else {
      await prisma.shiftLog.create({
        data: { riderId: userId }
      });
      return res.json({ status: "online", message: "Shift started successfully." });
    }
  } catch (error) {
    res.status(500).json({ message: "Shift toggle failed", error: error.message });
  }
};

exports.acceptOrder = async (req, res) => {
  try {
    const userId = parseInt(req.user.id, 10);
    const { orderId } = req.params;

    const activeShift = await prisma.shiftLog.findFirst({
      where: { riderId: userId, endTime: null }
    });

    if (!activeShift) {
      return res.status(400).json({ message: "You must go online before accepting orders." });
    }

    const order = await prisma.order.findUnique({
      where: { id: parseInt(orderId, 10) }
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    if (order.riderId) {
      return res.status(400).json({ message: "This order has already been taken by another rider." });
    }

    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: {
        riderId: userId,
        status: "out_for_delivery"
      }
    });

    res.json({ message: "Order accepted successfully!", order: updatedOrder });
  } catch (error) {
    res.status(500).json({ message: "Failed to accept order", error: error.message });
  }
};

exports.completeDelivery = async (req, res) => {
  try {
    const userId = parseInt(req.user.id, 10);
    const { orderId } = req.params;

    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user identity format" });
    }

    // 1. Fetch target order and verify ownership permissions
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

    // 2. Commit delivery confirmation status modification tracking variables
    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: {
        status: "delivered",
        updatedAt: new Date() // Automatically captures into today's earnings sum
      }
    });

    res.json({ message: "Delivery completed successfully! Earnings locked.", order: updatedOrder });
  } catch (error) {
    res.status(500).json({ message: "Failed to confirm delivery dropoff", error: error.message });
  }
};
 
exports.updateRiderProfile = async (req, res) => {
  try {
    const userId = parseInt(req.user.id, 10);
    const { firstName, lastName, phone, vehicleType, plateNumber } = req.body;

    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user identity format" });
    }

    // 1. If phone is changed, check if it's already taken by someone else
    if (phone) {
      const existingPhone = await prisma.user.findFirst({
        where: { phone, NOT: { id: userId } }
      });
      if (existingPhone) {
        return res.status(400).json({ message: "Phone number already in use" });
      }
    }

    // 2. Perform simultaneous update on User and nested RiderProfile models
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        firstName,
        lastName,
        phone,
        riderProfile: {
          update: {
            vehicleType,
            plateNumber: plateNumber || null
          }
        }
      },
      include: {
        riderProfile: true
      }
    });

    res.json({
      message: "Profile updated successfully!",
      profile: {
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        phone: updatedUser.phone,
        vehicleType: updatedUser.riderProfile?.vehicleType,
        plateNumber: updatedUser.riderProfile?.plateNumber,
        isVerified: updatedUser.riderProfile?.isVerified
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to update profile configurations", error: error.message });
  }
};

exports.updateRiderProfile = async (req, res) => {
  try {
    const userId = parseInt(req.user.id, 10);
    const { firstName, lastName, phone, vehicleType, plateNumber } = req.body;

    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user identity format" });
    }

    // Prepare updated variables object
    const updateData = {
      firstName,
      lastName,
      phone,
      riderProfile: {
        update: {
          vehicleType,
          plateNumber: plateNumber || null
        }
      }
    };

    // If a new avatar profile picture is uploaded via multer, save its path
    if (req.file) {
      updateData.avatarUrl = `/uploads/${req.file.filename}`;
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
        avatarUrl: updatedUser.avatarUrl,
        vehicleType: updatedUser.riderProfile?.vehicleType,
        plateNumber: updatedUser.riderProfile?.plateNumber,
        isVerified: updatedUser.riderProfile?.isVerified
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to update profile", error: error.message });
  }
};


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
        }
      },
      orderBy: { createdAt: "desc" }
    });

    res.json(riders);
  } catch (error) {
    res.status(500).json({ message: "Failed to retrieve riders", error: error.message });
  }
};


exports.updateRiderStatus = async (req, res) => {
  try {
    const riderId = parseInt(req.params.id, 10);
    const { status } = req.body;

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
      select: { id: true, status: true }
    });

    res.json({ message: `Rider profile updated to ${status}`, updatedRider });
  } catch (error) {
    res.status(500).json({ message: "Failed to modify rider status tracking flag", error: error.message });
  }
};


exports.rejectRiderApplication = async (req, res) => {
  try {
    const riderId = parseInt(req.params.id, 10);

    // Cascades and deletes user along with riderProfile due to schema onDelete: Cascade
    await prisma.user.delete({
      where: { id: riderId }
    });

    res.json({ message: "Rider application rejected and account purged successfully." });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete rider registry data record", error: error.message });
  }
};
