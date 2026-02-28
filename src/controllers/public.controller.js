const prisma = require("../lib/prisma");

// GET /public/restaurants
exports.listRestaurants = async (req, res) => {
  try {
    const { page = 1, limit = 20, q } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where = {
      status: "approved",
      ...(q
        ? {
            OR: [
              { name: { contains: String(q), mode: "insensitive" } },
              { city: { contains: String(q), mode: "insensitive" } },
              { state: { contains: String(q), mode: "insensitive" } },
              { type: { contains: String(q), mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [restaurants, total] = await Promise.all([
      prisma.business.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: Number(limit),
        select: {
          id: true,
          name: true,
          type: true,
          city: true,
          state: true,
          streetAddress: true,
          description: true,
          status: true,
          createdAt: true,
        },
      }),
      prisma.business.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        restaurants,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / Number(limit)),
        },
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: "Failed to fetch restaurants", error: e.message });
  }
};

// GET /public/restaurants/:businessId/menu
exports.getRestaurantMenu = async (req, res) => {
  try {
    const businessId = Number(req.params.businessId);

    // Only approved businesses should be visible publicly
    const business = await prisma.business.findFirst({
      where: { id: businessId, status: "approved" },
      select: { id: true, name: true },
    });

    if (!business) {
      return res.status(404).json({ success: false, message: "Restaurant not found" });
    }

    const items = await prisma.menuItem.findMany({
      where: { businessId, available: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        category: true,
        price: true,
        description: true,
        imageUrl: true,
        available: true,
      },
    });

    res.json({
      success: true,
      data: {
        restaurant: business,
        menu: items,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: "Failed to fetch menu", error: e.message });
  }
};