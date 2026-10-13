const prisma = require("../lib/prisma");

const deny = (res) =>
  res.status(403).json({ success: false, message: "Forbidden: you do not own this resource" });

const isAdmin = (req) => String(req.user?.role || "").toLowerCase() === "admin";

// Resolves the businessId from params (or body) and requires the caller to own it.
async function requireBusinessOwner(req, res, next) {
  try {
    const raw = req.params.businessId ?? req.body?.businessId;
    if (raw === undefined) return next(); // handler validates presence
    const id = parseInt(raw, 10);
    if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid businessId" });
    if (isAdmin(req)) return next();

    const business = await prisma.business.findUnique({ where: { id }, select: { ownerId: true } });
    if (!business) return res.status(404).json({ success: false, message: "Business not found" });
    if (business.ownerId !== req.user.id) return deny(res);
    next();
  } catch (e) {
    res.status(500).json({ success: false, message: "Ownership check failed" });
  }
}

// Requires :userId in the URL to be the caller.
function requireSelfParam(req, res, next) {
  if (isAdmin(req)) return next();
  if (parseInt(req.params.userId, 10) !== req.user.id) return deny(res);
  next();
}

// Requires :imageId to belong to a business owned by the caller.
async function requireGalleryImageOwner(req, res, next) {
  try {
    const image = await prisma.businessImage.findUnique({
      where: { id: parseInt(req.params.imageId, 10) },
      select: { business: { select: { ownerId: true } } },
    });
    if (!image) return res.status(404).json({ message: "Image not found." });
    if (!isAdmin(req) && image.business?.ownerId !== req.user.id) return deny(res);
    next();
  } catch (e) {
    res.status(500).json({ success: false, message: "Ownership check failed" });
  }
}

module.exports = { requireBusinessOwner, requireSelfParam, requireGalleryImageOwner };
