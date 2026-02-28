const prisma = require("../lib/prisma");

async function getOwnerBusiness(req) {
  const ownerId = req.user.id;
  return prisma.business.findFirst({
    where: { ownerId },
    select: { id: true, status: true }
  });
}

exports.getStaff = async (req, res) => {
  try {
    const business = await getOwnerBusiness(req);
    if (!business) return res.status(404).json({ success: false, message: "No business found" });

    const staff = await prisma.staffMember.findMany({
      where: { businessId: business.id },
      orderBy: { createdAt: "desc" }
    });

    res.json({ success: true, data: { staff } });
  } catch (e) {
    res.status(500).json({ success: false, message: "Failed to fetch staff", error: e.message });
  }
};

exports.createStaff = async (req, res) => {
  try {
    const business = await getOwnerBusiness(req);
    if (!business) return res.status(404).json({ success: false, message: "No business found" });

    const { fullName, role, email, phone, status } = req.body;
    if (!fullName || !role) {
      return res.status(400).json({ success: false, message: "fullName and role are required" });
    }

    const staff = await prisma.staffMember.create({
      data: {
        businessId: business.id,
        fullName,
        role,
        email: email || null,
        phone: phone || null,
        status: status || "Active"
      }
    });

    res.status(201).json({ success: true, data: { staff } });
  } catch (e) {
    res.status(500).json({ success: false, message: "Failed to create staff", error: e.message });
  }
};

exports.updateStaff = async (req, res) => {
  try {
    const business = await getOwnerBusiness(req);
    if (!business) return res.status(404).json({ success: false, message: "No business found" });

    const staffId = parseInt(req.params.staffId);

    const existing = await prisma.staffMember.findFirst({
      where: { id: staffId, businessId: business.id }
    });
    if (!existing) return res.status(404).json({ success: false, message: "Staff not found" });

    const { fullName, role, email, phone, status } = req.body;

    const staff = await prisma.staffMember.update({
      where: { id: staffId },
      data: {
        fullName: fullName ?? undefined,
        role: role ?? undefined,
        email: email === undefined ? undefined : (email || null),
        phone: phone === undefined ? undefined : (phone || null),
        status: status ?? undefined
      }
    });

    res.json({ success: true, data: { staff } });
  } catch (e) {
    res.status(500).json({ success: false, message: "Failed to update staff", error: e.message });
  }
};

exports.deleteStaff = async (req, res) => {
  try {
    const business = await getOwnerBusiness(req);
    if (!business) return res.status(404).json({ success: false, message: "No business found" });

    const staffId = parseInt(req.params.staffId);

    const existing = await prisma.staffMember.findFirst({
      where: { id: staffId, businessId: business.id }
    });
    if (!existing) return res.status(404).json({ success: false, message: "Staff not found" });

    await prisma.staffMember.delete({ where: { id: staffId } });

    res.json({ success: true, message: "Staff removed" });
  } catch (e) {
    res.status(500).json({ success: false, message: "Failed to remove staff", error: e.message });
  }
};