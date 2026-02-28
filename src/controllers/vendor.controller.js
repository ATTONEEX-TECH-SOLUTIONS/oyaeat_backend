const prisma = require("../lib/prisma");

// Step 3: Upload business details
const uploadBusinessDetails = async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      businessName,
      businessType,
      streetAddress,
      city,
      state,
      zipCode,
      businessPhone,
      businessEmail,
      websiteUrl,
      description,
    } = req.body;

    // Validate required fields
    if (
      !businessName ||
      !businessType ||
      !streetAddress ||
      !city ||
      !state ||
      !zipCode ||
      !businessPhone ||
      !businessEmail ||
      !description
    ) {
      return res.status(400).json({ message: "All required fields must be provided" });
    }

    // Verify user exists and phone is verified
    const user = await prisma.user.findUnique({
      where: { id: parseInt(userId) },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.phoneVerified) {
      return res.status(400).json({ message: "Phone number must be verified first" });
    }

    // Create business with status "pending_review"
    const business = await prisma.business.create({
      data: {
        ownerId: parseInt(userId),
        name: businessName,
        type: businessType,
        streetAddress,
        city,
        state,
        zipCode,
        businessPhone,
        businessEmail,
        websiteUrl: websiteUrl || null,
        description,
        status: "pending_review",
      },
    });

    res.status(201).json({
      message: "Business details uploaded successfully",
      businessId: business.id,
      status: business.status,
      nextStep: "Upload verification documents",
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Upload failed", error: error.message });
  }
};

// Step 4: Upload verification documents
const uploadVerificationDocuments = async (req, res) => {
  try {
    const { businessId } = req.params;

    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
      
    }
    console.log("req.files keys:", Object.keys(req.files || {}));

    const business = await prisma.business.findUnique({
      where: { id: parseInt(businessId) },
    });

    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    const requiredDocuments = [
      { fieldName: "business_license", type: "business_license" },
      { fieldName: "tax_id", type: "tax_id" },
      { fieldName: "food_certificate", type: "food_certificate" },
      { fieldName: "owner_id", type: "owner_id" },
      { fieldName: "bank_document", type: "bank_document" },
    ];

    for (const doc of requiredDocuments) {
      if (!req.files[doc.fieldName]) {
        return res
          .status(400)
          .json({ message: `Missing required document: ${doc.fieldName}` });
      }
    }

    const cloudinary = require("../lib/cloudinary");
    for (const doc of requiredDocuments) {
      const file = req.files[doc.fieldName][0];
    const ext = (file.originalname.split('.').pop() || '').toLowerCase()
      const isPdf = ext === 'pdf'

      const uploadResult = await cloudinary.uploader.upload(file.path, {
        folder: `oyaeat/business_documents/${businessId}`,
        use_filename: true,
        unique_filename: false,
        resource_type: 'image',

          access_mode: "public",
          type: "upload",
      });
      await prisma.businessDocument.create({
        data: {
          businessId: parseInt(businessId),
          type: doc.type,
          url: uploadResult.secure_url,
          fileName: file.originalname,
          verified: false,
        },
      });
    }

    const updatedBusiness = await prisma.business.update({
      where: { id: parseInt(businessId) },
      data: { status: "pending_review" },
    });

    res.json({
      message: "Documents uploaded successfully. Waiting for admin review.",
      businessId: updatedBusiness.id,
      status: updatedBusiness.status,
      documents: await prisma.businessDocument.findMany({
        where: { businessId: parseInt(businessId) },
      }),
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Document upload failed", error: error.message });
  }
};

// Get vendor registration status
const getVendorStatus = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: parseInt(userId) },
      include: {
        businesses: {
          include: {
            documents: true,
            bankDetail: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      userId: user.id,
      phoneVerified: user.phoneVerified,
      businesses: user.businesses,
      debug: true,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Failed to fetch status", error: error.message });
  }
};

// Step 5: Submit business bank details
const submitBankDetails = async (req, res) => {
  try {
    const { businessId: paramBusinessId } = req.params;
    const businessId = paramBusinessId ? parseInt(paramBusinessId) : parseInt(req.body.businessId);
    const { bankName, accountName, accountNumber, routingNumber } = req.body;

    if (!businessId || !bankName || !accountName || !accountNumber) {
      return res.status(400).json({ message: "bankName, accountName and accountNumber are required" });
    }

    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    const bankDetail = await prisma.businessBankDetail.upsert({
      where: { businessId },
      update: { bankName, accountName, accountNumber, routingNumber: routingNumber || null },
      create: {
        businessId,
        bankName,
        accountName,
        accountNumber,
        routingNumber: routingNumber || null,
      },
    });

    res.status(200).json({
      message: "Bank details saved successfully",
      businessId: business.id,
      bankDetail,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Failed to save bank details", error: error.message });
  }
};
// Vendor: list businesses by status
const getVendorBusinesses = async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.query;

    const where = { ownerId: parseInt(userId) };
    if (status) where.status = status;

    const businesses = await prisma.business.findMany({
      where,
      include: { documents: true, bankDetail: true },
      orderBy: { createdAt: "desc" },
    });

    res.json({ userId: parseInt(userId), businesses });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch businesses", error: error.message });
  }
};

// Vendor: full business detail for dashboard
const getBusinessDetail = async (req, res) => {
  try {
    const { businessId } = req.params;
    const business = await prisma.business.findUnique({
      where: { id: parseInt(businessId) },
      include: { documents: true, bankDetail: true, owner: true },
    });

    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    res.json({ business });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch business", error: error.message });
  }
};

const getVendorDashboard = async (req, res) => {
  try {
    const ownerId = req.user.id;

    const business = await prisma.business.findFirst({
      where: { ownerId },
      include: { documents: true, bankDetail: true },
      orderBy: { createdAt: "desc" },
    });

    if (!business) {
      return res.json({
        success: true,
        data: {
          dashboard: {
            business: null,
            summary: null,
            recentOrders: [],
            salesSeries: [],
          },
        },
      });
    }

    const hasDocuments = (business.documents?.length || 0) > 0;
    const hasBankDetails = !!business.bankDetail;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [totalOrders, revenueTodayAgg, activeOrders] = await Promise.all([
      prisma.order.count({ where: { businessId: business.id } }),
      prisma.order.aggregate({
        where: { businessId: business.id, createdAt: { gte: todayStart } },
        _sum: { total: true },
      }),
      prisma.order.count({
        where: {
          businessId: business.id,
          status: { in: ["pending", "preparing", "ready", "out_for_delivery"] },
        },
      }),
    ]);

    const recentOrders = await prisma.order.findMany({
      where: { businessId: business.id },
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const days = 7;
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);

    const ordersLast7 = await prisma.order.findMany({
      where: { businessId: business.id, createdAt: { gte: start } },
      select: { createdAt: true, total: true },
    });

    const buckets = new Map();
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      buckets.set(key, { date: key, revenue: 0, orders: 0 });
    }

    for (const o of ordersLast7) {
      const key = o.createdAt.toISOString().slice(0, 10);
      if (!buckets.has(key)) buckets.set(key, { date: key, revenue: 0, orders: 0 });
      const b = buckets.get(key);
      b.revenue += o.total;
      b.orders += 1;
    }

    const salesSeries = Array.from(buckets.values());

    const totalCustomers = 0;
    const revenueToday = revenueTodayAgg?._sum?.total || 0;
    const avgOrderValue =
      recentOrders.length > 0
        ? recentOrders.reduce((s, o) => s + o.total, 0) / recentOrders.length
        : 0;

    res.json({
      success: true,
      data: {
        dashboard: {
          business: {
            id: business.id,
            name: business.name,
            status: business.status,
            rejectionReason: business.rejectionReason,
            hasDocuments,
            hasBankDetails,
          },
          summary: {
            totalOrders,
            revenueToday,
            activeOrders,
            totalCustomers,
            avgOrderValue: Number(avgOrderValue.toFixed(2)),
            avgDeliveryTimeMins: 0,
            customerRating: 0,
            avgPrepTimeMins: 0,
          },
          recentOrders,
          salesSeries,
        },
      },
    });
  } catch (error) {
    console.error("Vendor dashboard error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch vendor dashboard",
      error: error.message,
    });
  }
};



module.exports = {
  uploadBusinessDetails,
  uploadVerificationDocuments,
  getVendorStatus,
  submitBankDetails,
  getVendorBusinesses,
  getBusinessDetail,
  getVendorDashboard,
};