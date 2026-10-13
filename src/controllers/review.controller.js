const prisma = require("../lib/prisma");

// POST /orders/:id/review  { rating: 1-5, comment? }   (customer, delivered orders, once)
exports.createReview = async (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    const rating = Number(req.body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: "rating must be a whole number from 1 to 5" });
    }
    const comment = req.body.comment ? String(req.body.comment).trim().slice(0, 1000) : null;

    const order = await prisma.order.findFirst({
      where: { id: orderId, customerId: req.user.id },
      select: { id: true, status: true, businessId: true },
    });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    if (order.status !== "delivered") {
      return res.status(409).json({ success: false, message: "You can only review a delivered order" });
    }

    try {
      const review = await prisma.review.create({
        data: { orderId, businessId: order.businessId, customerId: req.user.id, rating, comment },
      });
      res.status(201).json({ success: true, data: { review } });
    } catch (e) {
      if (e.code === "P2002") {
        return res.status(409).json({ success: false, message: "You already reviewed this order" });
      }
      throw e;
    }
  } catch (e) {
    res.status(500).json({ success: false, message: "Failed to save review", error: e.message });
  }
};

const shape = (r) => ({
  id: r.id,
  rating: r.rating,
  comment: r.comment,
  createdAt: r.createdAt,
  orderId: r.orderId,
  customerName: r.customer ? `${r.customer.firstName} ${(r.customer.lastName || "").charAt(0)}.`.trim() : "Customer",
});

async function listFor(businessId, req, res) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));

  const [reviews, agg] = await Promise.all([
    prisma.review.findMany({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { customer: { select: { firstName: true, lastName: true } } },
    }),
    prisma.review.aggregate({ where: { businessId }, _avg: { rating: true }, _count: { rating: true } }),
  ]);

  const total = agg._count.rating;
  res.json({
    success: true,
    data: {
      reviews: reviews.map(shape),
      averageRating: total ? Math.round(agg._avg.rating * 10) / 10 : null,
      reviewCount: total,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    },
  });
}

// GET /vendor/reviews?page&limit
exports.getVendorReviews = async (req, res) => {
  try {
    const business = await prisma.business.findFirst({ where: { ownerId: req.user.id }, select: { id: true } });
    if (!business) return res.status(404).json({ success: false, message: "No business found" });
    await listFor(business.id, req, res);
  } catch (e) {
    res.status(500).json({ success: false, message: "Failed to load reviews", error: e.message });
  }
};

// GET /public/restaurants/:businessId/reviews
exports.getPublicReviews = async (req, res) => {
  try {
    const businessId = parseInt(req.params.businessId, 10);
    const business = await prisma.business.findFirst({ where: { id: businessId, status: "approved" }, select: { id: true } });
    if (!business) return res.status(404).json({ success: false, message: "Restaurant not found" });
    await listFor(businessId, req, res);
  } catch (e) {
    res.status(500).json({ success: false, message: "Failed to load reviews", error: e.message });
  }
};

// Attaches averageRating / rating / reviewCount to a list of restaurant rows.
exports.withRatings = async (restaurants) => {
  if (!restaurants.length) return restaurants;
  const groups = await prisma.review.groupBy({
    by: ["businessId"],
    where: { businessId: { in: restaurants.map((r) => r.id) } },
    _avg: { rating: true },
    _count: { rating: true },
  });
  const map = new Map(groups.map((g) => [g.businessId, g]));
  return restaurants.map((r) => {
    const g = map.get(r.id);
    const avg = g ? Math.round(g._avg.rating * 10) / 10 : null;
    return { ...r, averageRating: avg, rating: avg, reviewCount: g ? g._count.rating : 0 };
  });
};
