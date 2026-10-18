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
      // ── NEW: EXTRACT FLOATS PUSHED FROM FRONTEND MAP PICKER ──
      latitude,
      longitude
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
        // ── NEW: ATTACH AND CAST TO NUMBERS FOR NATIVE SPATIAL QUERIES ──
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null
      },
    });

    console.log(`🏢 Onboarded New Restaurant: ${business.name} at GPS: [${business.latitude}, ${business.longitude}]`);

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


const uploadVerificationDocuments = async (req, res) => {
  try {
    const { businessId } = req.params;
    const parsedBusinessId = parseInt(businessId, 10);

    // 1. Fetch pre-existing documents already saved for this business in the DB
    const existingDocs = await prisma.businessDocument.findMany({
      where: { businessId: parsedBusinessId }
    });

    const requiredDocuments = [
      { fieldName: "business_license", type: "business_license" },
      { fieldName: "tax_id",            type: "tax_id" },
      { fieldName: "food_certificate",  type: "food_certificate" },
      { fieldName: "owner_id",          type: "owner_id" },
      { fieldName: "bank_document",     type: "bank_document" },
    ];

    // 2.  SMART VALIDATION: Check if files are fresh OR historical DB targets
    const missingFields = [];

    for (const doc of requiredDocuments) {
      const isUploadedFresh = req.files && 
                              req.files[doc.fieldName] && 
                              Array.isArray(req.files[doc.fieldName]) && 
                              req.files[doc.fieldName].length > 0;
      
      const existsInDatabase = existingDocs && existingDocs.some(d => d.type === doc.type);

      // A document is valid if it exists fresh in payload OR already exists in DB
      if (!isUploadedFresh && !existsInDatabase) {
        missingFields.push(doc.fieldName);
      }
    }

    if (missingFields.length > 0) {
      return res.status(400).json({ 
        message: `Missing required document: ${missingFields.join(", ")}. Please ensure all compliance fields are complete.` 
      });
    }

    // 3. Process only the newly uploaded files to Cloudinary
    const cloudinary = require("../lib/cloudinary");
    
    for (const doc of requiredDocuments) {
      const isUploadedFresh = req.files && 
                              req.files[doc.fieldName] && 
                              Array.isArray(req.files[doc.fieldName]) && 
                              req.files[doc.fieldName].length > 0;
                              
      if (!isUploadedFresh) continue;

      // 🌟 FIX HERE: Add [0] at the end to pull the exact file object from the Multer field array!
      const file = req.files[doc.fieldName][0]; 

      // 🧹 CLOUDINARY STORAGE PURGE: Locate old file version and destroy it from the cloud
      const oldDocRecord = existingDocs.find(d => d.type === doc.type);
      if (oldDocRecord && oldDocRecord.url) {
        try {
          const urlParts = oldDocRecord.url.split('/');
          const folderIdx = urlParts.indexOf('oyaeat');
          if (folderIdx !== -1) {
            const publicIdWithExt = urlParts.slice(folderIdx).join('/');
            const publicId = publicIdWithExt.substring(0, publicIdWithExt.lastIndexOf('.'));
            await cloudinary.uploader.destroy(publicId);
            console.log(`🗑️ Purged old Cloudinary asset for type: ${doc.type}`);
          }
        } catch (cloudErr) {
          console.error(`⚠️ Non-blocking asset purge bypass:`, cloudErr.message);
        }
      }

      // Upload the replacement / new file copy
      const uploadResult = await cloudinary.uploader.upload(file.path, {
        folder: `oyaeat/business_documents/${businessId}`,
        use_filename: true,
        unique_filename: true, 
        resource_type: 'image',
        access_mode: "public",
        type: "upload",
      });
      
      // rest of your prisma code...

      
      // Upsert tracking layer: Safely wipe old database row definition
      await prisma.businessDocument.deleteMany({
        where: {
          businessId: parsedBusinessId,
          type: doc.type
        }
      });

      // Write fresh document row configuration
      await prisma.businessDocument.create({
        data: {
          businessId: parsedBusinessId,
          type: doc.type,
          url: uploadResult.secure_url,
          fileName: file.originalname,
          verified: false, // Reset individual check flag for the admin panel review
        },
      });
    }

    // 4. 🧼 STATUS SYSTEM RESET: Force business status back to "pending_review" and wipe rejections
    const updatedBusiness = await prisma.business.update({
      where: { id: parsedBusinessId },
      data: { 
        status: "pending_review",
        rejectionReason: null 
      },
    });

    res.json({
      message: "Documents updated successfully. Re-submitting application for review.",
      businessId: updatedBusiness.id,
      status: updatedBusiness.status,
      documents: await prisma.businessDocument.findMany({
        where: { businessId: parsedBusinessId },
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
    // Securely pull authenticated identity context straight out of token extraction middleware
    const userId = parseInt(req.user.id, 10); 

    const user = await prisma.user.findUnique({
      where: { id: userId },
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
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Since validation patterns limit users to one single registration context, pull index 0 safely
    const rawBusiness = user.businesses && user.businesses.length > 0 
      ? user.businesses[0] 
      : null;

    let hasDocumentsUploaded = false;
    let hasBankLinked = false;

    if (rawBusiness) {
      // Evaluate actual child relation rows to accurately report progress checklist indicators
      hasDocumentsUploaded = rawBusiness.hasDocuments || 
        (Array.isArray(rawBusiness.documents) && rawBusiness.documents.length > 0);
      
      hasBankLinked = rawBusiness.hasBankDetails || 
        rawBusiness.bankDetail !== null;
    }

    const businessPayload = rawBusiness ? {
      ...rawBusiness,
      hasDocuments: hasDocumentsUploaded,
      hasBankDetails: hasBankLinked
    } : null;

    // Returns structural attributes clean to both direct lookups and nested data configurations
    res.json({
      success: true,
      userId: user.id,
      phoneVerified: user.phoneVerified,
      business: businessPayload,
      data: {
        userId: user.id,
        phoneVerified: user.phoneVerified,
        business: businessPayload
      },
      debug: true,
    });
  } catch (error) {
    console.error("Error inside getVendorStatus guard:", error);
    res.status(500).json({ success: false, message: "Failed to fetch status", error: error.message });
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

    const existing = await prisma.businessBankDetail.findUnique({ where: { businessId } });
    if (existing?.paystackSubaccountCode) {
      return res.status(403).json({
        message: "Your payout account is managed by OyaEat. Contact support to change your bank details.",
      });
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
      include: { documents: true, bankDetail: true, galleryImages: true },
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
      include: {
        documents: true,
        bankDetail: true,
        owner: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        galleryImages: true,
      },
    });

    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    res.json({ business });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch business", error: error.message });
  }
};



// ── DASHBOARD NUMBERS ────────────────────────────────────────────
// A "sale" is an order the restaurant has accepted and not cancelled: preparing,
// ready, out for delivery or delivered. Pending orders are not sales yet, cancelled
// ones never are. Online-payment orders only reach the kitchen once paid, so
// everything counted here is paid or cash. "Today" and the daily chart use the
// business timezone (Lagos, UTC+1 by default; override with BUSINESS_TZ_OFFSET_MIN).
const SALE_STATUSES = ["preparing", "ready", "out_for_delivery", "delivered"];
const ACTIVE_STATUSES = ["pending", "preparing", "ready", "out_for_delivery"];
const TZ_OFFSET_MIN = Number.isFinite(Number(process.env.BUSINESS_TZ_OFFSET_MIN))
  ? Number(process.env.BUSINESS_TZ_OFFSET_MIN)
  : 60;

const visibleToKitchen = {
  OR: [{ paymentMethod: null }, { paymentMethod: { not: "paystack" } }, { paymentStatus: "paid" }],
};

// "YYYY-MM-DD" of an instant, in the business timezone
const dayKey = (d) => new Date(d.getTime() + TZ_OFFSET_MIN * 60000).toISOString().slice(0, 10);

async function computeDashboardStats(businessId) {
  const base = { businessId, ...visibleToKitchen };
  const now = new Date();
  const todayKey = dayKey(now);

  // start (UTC instant) of the business day 6 days ago
  const startOfToday = new Date(Date.parse(`${todayKey}T00:00:00Z`) - TZ_OFFSET_MIN * 60000);
  const weekStart = new Date(startOfToday.getTime() - 6 * 86400000);

  const [allTime, today, totalOrders, activeOrders, customers, weekOrders, recent, rating, delivered] =
    await Promise.all([
      prisma.order.aggregate({ where: { ...base, status: { in: SALE_STATUSES } }, _sum: { total: true }, _count: { _all: true } }),
      prisma.order.aggregate({ where: { ...base, status: { in: SALE_STATUSES }, createdAt: { gte: startOfToday } }, _sum: { total: true } }),
      prisma.order.count({ where: { ...base, status: { not: "cancelled" } } }),
      prisma.order.count({ where: { ...base, status: { in: ACTIVE_STATUSES } } }),
      prisma.order.findMany({ where: { ...base, status: { in: SALE_STATUSES }, customerId: { not: null } }, distinct: ["customerId"], select: { customerId: true } }),
      prisma.order.findMany({ where: { ...base, status: { in: SALE_STATUSES }, createdAt: { gte: weekStart } }, select: { createdAt: true, total: true } }),
      prisma.order.findMany({ where: base, orderBy: { createdAt: "desc" }, take: 5, include: { items: true } }),
      prisma.review.aggregate({ where: { businessId }, _avg: { rating: true } }),
      prisma.order.findMany({ where: { ...base, status: "delivered" }, orderBy: { updatedAt: "desc" }, take: 30, select: { createdAt: true, updatedAt: true } }),
    ]);

  const totalSales = allTime._sum.total || 0;
  const saleCount = allTime._count._all;

  // 7 daily buckets, oldest first, zero-filled
  const buckets = new Map();
  for (let i = 6; i >= 0; i--) {
    buckets.set(dayKey(new Date(startOfToday.getTime() - i * 86400000 + 12 * 3600000)), { revenue: 0, orders: 0 });
  }
  for (const o of weekOrders) {
    const b = buckets.get(dayKey(o.createdAt));
    if (b) { b.revenue += o.total; b.orders += 1; }
  }

  // No delivery timestamp is stored, so use "last updated - placed" and ignore anything over
  // 3 hours (an order touched again later, e.g. a refund flag, would otherwise skew it).
  const durations = delivered.map((o) => (o.updatedAt - o.createdAt) / 60000).filter((m) => m > 0 && m <= 180);
  const avgDeliveryMins = durations.length ? Math.round(durations.reduce((n, m) => n + m, 0) / durations.length) : 0;

  return {
    summary: {
      totalSales,
      totalOrders,
      revenueToday: today._sum.total || 0,
      activeOrders,
      totalCustomers: customers.length,
      avgOrderValue: saleCount ? Math.round(totalSales / saleCount) : 0,
      avgDeliveryTimeMins: avgDeliveryMins, // order placed -> delivered; prep time is not tracked
      customerRating: rating._avg.rating ? Math.round(rating._avg.rating * 10) / 10 : 0,
      avgPrepTimeMins: 0, // not tracked yet
    },
    recentOrders: recent,
    salesSeries: [...buckets].map(([date, v]) => ({ date, revenue: v.revenue, orders: v.orders })),
  };
}

// Replace your getVendorDashboard function with this updated code:
const getVendorDashboard = async (req, res) => {
  try {
    const ownerId = parseInt(req.user.id, 10);

    // 🌟 ENHANCEMENT: Look for an active or under-review profile first to avoid stale fallbacks
    let business = await prisma.business.findFirst({
      where: { ownerId, status: "pending_review" },
      include: { documents: true, bankDetail: true, galleryImages: true },
    });

    // If no profile is pending review, grab the most recently modified profile row
    if (!business) {
      business = await prisma.business.findFirst({
        where: { ownerId },
        include: { documents: true, bankDetail: true, galleryImages: true },
        orderBy: { updatedAt: "desc" }, // 👈 Keeps status states tied to current changes
      });
    }

    if (!business) {
      return res.json({
        success: true,
        dashboard: {
          business: null,
          summary: null,
          recentOrders: [],
          salesSeries: [],
        },
      });
    }

    const hasDocumentsUploaded = business.hasDocuments || (Array.isArray(business.documents) && business.documents.length > 0);
    const hasBankLinked = business.hasBankDetails || business.bankDetail !== null;
    const stats = await computeDashboardStats(business.id);

    const dashboard = {
      business: {
        ...business,
        hasDocuments: hasDocumentsUploaded,
        hasBankDetails: hasBankLinked,
      },
      summary: stats.summary,
      recentOrders: stats.recentOrders,
      salesSeries: stats.salesSeries,
    };

    // `dashboard` at the top level for older callers; `data.dashboard` is what the vendor app reads
    res.json({ success: true, dashboard, data: { dashboard } });

  } catch (error) {
    res.status(500).json({ success: false, message: "Dashboard error", error: error.message });
  }
};



// ── STEP 6: UPLOAD SHOWCASE GALLERY IMAGES ────────────────────────
const uploadGalleryImages = async (req, res) => {
  try {
    const { businessId } = req.params;

    if (!req.files || !req.files.gallery || req.files.gallery.length === 0) {
      return res.status(400).json({ message: "No files uploaded for gallery display look." });
    }

    const business = await prisma.business.findUnique({
      where: { id: parseInt(businessId, 10) },
    });

    if (!business) {
      return res.status(404).json({ message: "Business profile not found" });
    }

    const cloudinary = require("../lib/cloudinary");
    const uploadedImages = [];

    for (const file of req.files.gallery) {
      const uploadResult = await cloudinary.uploader.upload(file.path, {
        folder: `oyaeat/business_gallery/${businessId}`,
        use_filename: true,
        unique_filename: true,
        resource_type: 'image',
        access_mode: "public",
        type: "upload",
      });

      const savedImage = await prisma.businessImage.create({
        data: {
          businessId: parseInt(businessId, 10),
          imageUrl: uploadResult.secure_url,
        },
      });
      uploadedImages.push(savedImage);
    }

    res.status(201).json({
      message: "Gallery images uploaded successfully.",
      businessId: parseInt(businessId, 10),
      gallery: uploadedImages
    });
  } catch (error) {
    res.status(500).json({ message: "Gallery upload failed", error: error.message });
  }
};

// ── VENDOR SIDE: PERMANENT GALLERY REMOVAL ────────────────────────
const deleteGalleryImage = async (req, res) => {
  try {
    const imageId = parseInt(req.params.imageId, 10);

    const targetImage = await prisma.businessImage.findUnique({
      where: { id: imageId }
    });

    if (!targetImage) {
      return res.status(404).json({ message: "Image not found." });
    }

    try {
      const cloudinary = require("../lib/cloudinary");
      const urlParts = targetImage.imageUrl.split('/');
      const folderIdx = urlParts.indexOf('oyaeat');
      
      if (folderIdx !== -1) {
        const publicIdWithExt = urlParts.slice(folderIdx).join('/');
        const publicId = publicIdWithExt.substring(0, publicIdWithExt.lastIndexOf('.'));
        await cloudinary.uploader.destroy(publicId);
      }
    } catch (cloudinaryError) {
      console.error("Cloudinary bypass deletion skipped:", cloudinaryError.message);
    }

    await prisma.businessImage.delete({
      where: { id: imageId }
    });

    res.json({ success: true, message: "Gallery image purged successfully." });
  } catch (error) {
    res.status(500).json({ message: "Failed to purge image resource", error: error.message });
  }
};


/**
 * Vendor Action: Submit advertisement draft for admin sanitation
 * Route: POST /api/vendor/advert/submit
 */
const submitVendorAdvert = async (req, res) => {
  try {
    const { subject, content, targetRole } = req.body;
    const ownerId = parseInt(req.user.id, 10); // Extracted from authMiddleware

    if (!content) {
      return res.status(400).json({ success: false, message: 'Advertisement content is required' });
    }

    // Verify target selection stays safe
    const finalTarget = ["rider", "customer", "all"].includes(targetRole) ? targetRole : "all";

    // 1. Create the base broadcast thread flagged as unapproved
    const thread = await prisma.thread.create({
      data: {
        type: 'broadcast',
        subject: subject || 'Restaurant Advertisement',
        status: 'pending_review' // Utilizing a tracking flag to indicate admin review state
      }
    });

    // 2. Attach the initial draft copy text payload
    const message = await prisma.message.create({
      data: {
        threadId: thread.id,
        senderId: ownerId,
        senderRole: 'owner', // Saved as 'owner' to track origin properly
        content: content,
      }
    });

    res.status(201).json({
      success: true,
      message: 'Advertisement draft submitted successfully and is currently awaiting administrator review.',
      data: {
        threadId: thread.id,
        subject: thread.subject,
        targetRole: finalTarget,
        message
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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
  uploadGalleryImages,
  deleteGalleryImage,
  submitVendorAdvert
};
