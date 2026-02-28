const prisma = require("../lib/prisma");

async function getOwnerBusiness(req) {
  const ownerId = req.user.id;
  return prisma.business.findFirst({
    where: { ownerId },
    select: { id: true, status: true, name: true }
  });
}

exports.getMenu = async (req, res) => {
  try {
    const business = await getOwnerBusiness(req);
    if (!business) return res.status(404).json({ success: false, message: "No business found" });

    const items = await prisma.menuItem.findMany({
      where: { businessId: business.id },
      orderBy: { createdAt: "desc" }
    });

    res.json({ success: true, data: { business, items } });
  } catch (e) {
    res.status(500).json({ success: false, message: "Failed to fetch menu", error: e.message });
  }
};

exports.createMenuItem = async (req, res) => {
  try {
    const business = await getOwnerBusiness(req);
    if (!business) return res.status(404).json({ success: false, message: "No business found" });

    const { name, category, price, description, imageUrl, available } = req.body;
    if (!name || !category || price == null) {
      return res.status(400).json({ success: false, message: "name, category and price are required" });
    }

    const item = await prisma.menuItem.create({
      data: {
        businessId: business.id,
        name,
        category,
        price: Number(price),
        description: description || null,
        imageUrl: imageUrl || null,
        available: available !== undefined ? Boolean(available) : true
      }
    });

    res.status(201).json({ success: true, data: { item } });
  } catch (e) {
    res.status(500).json({ success: false, message: "Failed to create item", error: e.message });
  }
};

exports.updateMenuItem = async (req, res) => {
  try {
    const business = await getOwnerBusiness(req);
    if (!business) return res.status(404).json({ success: false, message: "No business found" });

    const itemId = parseInt(req.params.itemId);

    // ensure item belongs to this business
    const existing = await prisma.menuItem.findFirst({ where: { id: itemId, businessId: business.id } });
    if (!existing) return res.status(404).json({ success: false, message: "Menu item not found" });

    const { name, category, price, description, imageUrl, available } = req.body;

    const item = await prisma.menuItem.update({
      where: { id: itemId },
      data: {
        name: name ?? undefined,
        category: category ?? undefined,
        price: price != null ? Number(price) : undefined,
        description: description === undefined ? undefined : (description || null),
        imageUrl: imageUrl === undefined ? undefined : (imageUrl || null),
        available: available === undefined ? undefined : Boolean(available)
      }
    });

    res.json({ success: true, data: { item } });
  } catch (e) {
    res.status(500).json({ success: false, message: "Failed to update item", error: e.message });
  }
};

exports.deleteMenuItem = async (req, res) => {
  try {
    const business = await getOwnerBusiness(req);
    if (!business) return res.status(404).json({ success: false, message: "No business found" });

    const itemId = parseInt(req.params.itemId);

    const existing = await prisma.menuItem.findFirst({ where: { id: itemId, businessId: business.id } });
    if (!existing) return res.status(404).json({ success: false, message: "Menu item not found" });

    await prisma.menuItem.delete({ where: { id: itemId } });

    res.json({ success: true, message: "Menu item deleted" });
  } catch (e) {
    res.status(500).json({ success: false, message: "Failed to delete item", error: e.message });
  }
};