const prisma = require("../lib/prisma");

const fail = (res, e, message) => res.status(500).json({ success: false, message, error: e.message });
const MAX_ADDRESSES = 10;

// ── Address book ─────────────────────────────────────────────

// GET /customer/addresses
exports.listAddresses = async (req, res) => {
  try {
    const addresses = await prisma.customerAddress.findMany({
      where: { userId: req.user.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    res.json({ success: true, data: { addresses } });
  } catch (e) { fail(res, e, "Failed to load addresses"); }
};

// POST /customer/addresses { label, address, latitude?, longitude?, isDefault? }
exports.createAddress = async (req, res) => {
  try {
    const { label, address, latitude, longitude, isDefault } = req.body;
    if (!label?.trim() || !address?.trim()) {
      return res.status(400).json({ success: false, message: "label and address are required" });
    }
    const count = await prisma.customerAddress.count({ where: { userId: req.user.id } });
    if (count >= MAX_ADDRESSES) {
      return res.status(400).json({ success: false, message: `You can save up to ${MAX_ADDRESSES} addresses` });
    }
    const makeDefault = Boolean(isDefault) || count === 0;

    const created = await prisma.$transaction(async (tx) => {
      if (makeDefault) await tx.customerAddress.updateMany({ where: { userId: req.user.id }, data: { isDefault: false } });
      return tx.customerAddress.create({
        data: {
          userId: req.user.id,
          label: label.trim(),
          address: address.trim(),
          latitude: latitude != null ? Number(latitude) : null,
          longitude: longitude != null ? Number(longitude) : null,
          isDefault: makeDefault,
        },
      });
    });
    res.status(201).json({ success: true, data: { address: created } });
  } catch (e) { fail(res, e, "Failed to save address"); }
};

// PATCH /customer/addresses/:id
exports.updateAddress = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { label, address, latitude, longitude, isDefault } = req.body;
    const existing = await prisma.customerAddress.findFirst({ where: { id, userId: req.user.id } });
    if (!existing) return res.status(404).json({ success: false, message: "Address not found" });

    const data = {};
    if (label !== undefined) data.label = String(label).trim();
    if (address !== undefined) data.address = String(address).trim();
    if (latitude !== undefined) data.latitude = latitude === null ? null : Number(latitude);
    if (longitude !== undefined) data.longitude = longitude === null ? null : Number(longitude);
    if (data.label === "" || data.address === "") {
      return res.status(400).json({ success: false, message: "label and address cannot be empty" });
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (isDefault === true) {
        await tx.customerAddress.updateMany({ where: { userId: req.user.id }, data: { isDefault: false } });
        data.isDefault = true;
      }
      return tx.customerAddress.update({ where: { id }, data });
    });
    res.json({ success: true, data: { address: updated } });
  } catch (e) { fail(res, e, "Failed to update address"); }
};

// DELETE /customer/addresses/:id
exports.deleteAddress = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await prisma.customerAddress.findFirst({ where: { id, userId: req.user.id } });
    if (!existing) return res.status(404).json({ success: false, message: "Address not found" });

    await prisma.customerAddress.delete({ where: { id } });
    if (existing.isDefault) {
      const next = await prisma.customerAddress.findFirst({ where: { userId: req.user.id }, orderBy: { createdAt: "desc" } });
      if (next) await prisma.customerAddress.update({ where: { id: next.id }, data: { isDefault: true } });
    }
    res.json({ success: true, message: "Address removed" });
  } catch (e) { fail(res, e, "Failed to delete address"); }
};

// ── Favourites ───────────────────────────────────────────────

// GET /customer/favorites
exports.listFavorites = async (req, res) => {
  try {
    const rows = await prisma.favoriteRestaurant.findMany({
      where: { userId: req.user.id, business: { status: "approved" } },
      orderBy: { createdAt: "desc" },
      include: {
        business: {
          select: { id: true, name: true, type: true, city: true, thumbnailUrl: true, profilePicUrl: true },
        },
      },
    });
    res.json({ success: true, data: { favorites: rows.map((r) => r.business), ids: rows.map((r) => r.businessId) } });
  } catch (e) { fail(res, e, "Failed to load favourites"); }
};

// PUT /customer/favorites/:businessId   (idempotent)
exports.addFavorite = async (req, res) => {
  try {
    const businessId = parseInt(req.params.businessId, 10);
    const business = await prisma.business.findFirst({ where: { id: businessId, status: "approved" }, select: { id: true } });
    if (!business) return res.status(404).json({ success: false, message: "Restaurant not found" });

    await prisma.favoriteRestaurant.upsert({
      where: { userId_businessId: { userId: req.user.id, businessId } },
      update: {},
      create: { userId: req.user.id, businessId },
    });
    res.json({ success: true, message: "Added to favourites" });
  } catch (e) { fail(res, e, "Failed to add favourite"); }
};

// DELETE /customer/favorites/:businessId   (idempotent)
exports.removeFavorite = async (req, res) => {
  try {
    await prisma.favoriteRestaurant.deleteMany({
      where: { userId: req.user.id, businessId: parseInt(req.params.businessId, 10) },
    });
    res.json({ success: true, message: "Removed from favourites" });
  } catch (e) { fail(res, e, "Failed to remove favourite"); }
};
