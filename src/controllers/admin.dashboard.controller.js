const prisma = require("../lib/prisma");

// GET /admin/dashboard/metrics
exports.getDashboardMetrics = async (req, res) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    // Businesses
    const [totalRestaurants, activeRestaurants, pendingApprovals] = await Promise.all([
      prisma.business.count(),
      prisma.business.count({ where: { status: "approved" } }),
      prisma.business.count({ where: { status: "pending_review" } }),
    ]);

    // Orders (exclude cancelled from revenue + counts)
    const orderWhere = { status: { not: "cancelled" } };

    const [totalOrders, todayOrders, revenueAgg] = await Promise.all([
      prisma.order.count({ where: orderWhere }),
      prisma.order.count({
        where: {
          ...orderWhere,
          createdAt: { gte: startOfToday, lt: startOfTomorrow },
        },
      }),
      prisma.order.aggregate({
        where: orderWhere,
        _sum: { total: true },
        _avg: { total: true },
      }),
    ]);

    const totalRevenue = revenueAgg?._sum?.total ?? 0;
    const avgOrderValue = revenueAgg?._avg?.total ?? 0;

    return res.json({
      success: true,
      data: {
        totalRestaurants,
        activeRestaurants,
        pendingApprovals,

        totalOrders,
        todayOrders,
        totalRevenue,
        avgOrderValue,

        // placeholders for later
        totalRiders: 0,
        activeRiders: 0,
      },
    });
  } catch (error) {
    console.error("getDashboardMetrics error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load dashboard metrics",
    });
  }
};



/**
 * Controller Action: Fetches all currently online riders for the map telemetry monitor
 * Route: GET /api/admin-dashboard/live-riders
 */
exports.getLiveRidersTelemetry = async (req, res) => {
  try {
    const activeRiders = await prisma.shiftLog.findMany({
      where: {
        isOnline: true,
        latitude: { not: null },
        longitude: { not: null },
        user: { role: "rider" } // Explicit check that role type is a rider
      },
      select: {
        userId: true,
        latitude: true,
        longitude: true,
        updatedAt: true,
        user: {
          select: {
            firstName: true,
            lastName: true,
            phone: true,
            email: true
          }
        }
      }
    });

    // Flatten data properties cleanly for the frontend mapping keys
    const formattedFleetData = activeRiders.map((log) => ({
      riderId: log.userId,
      latitude: log.latitude,
      longitude: log.longitude,
      firstName: log.user.firstName,
      lastName: log.user.lastName,
      phone: log.user.phone,
      email: log.user.email,
      lastSeen: log.updatedAt
    }));

    return res.status(200).json(formattedFleetData);

  } catch (error) {
    console.error("Live map fleet query breakdown:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Failed to collect live fleet mapping coordinates", 
      error: error.message 
    });
  }
};
