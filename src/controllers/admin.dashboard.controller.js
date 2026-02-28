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