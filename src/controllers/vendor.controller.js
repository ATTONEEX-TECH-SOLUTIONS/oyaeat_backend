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
      include: { documents: true, bankDetail: true, owner: true, galleryImages: true },
    });

    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    res.json({ business });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch business", error: error.message });
  }
};

// Vendor: Dashboard core details
const getVendorDashboard = async (req, res) => {
  try {
    const ownerId = parseInt(req.user.id, 10);

    const business = await prisma.business.findFirst({
      where: { ownerId },
      include: { documents: true, bankDetail: true, galleryImages: true },
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

    // Safety fallback payload closing off the uncompleted controller code block
    res.json({
      success: true,
      data: {
        dashboard: {
          business,
          summary: { totalSales: 0, totalOrders: 0 },
          recentOrders: [],
          salesSeries: [],
        }
      }
    });
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

module.exports = {
  uploadBusinessDetails,
  uploadVerificationDocuments,
  getVendorStatus,
  submitBankDetails,
  getVendorBusinesses,
  getBusinessDetail,
  getVendorDashboard,
  uploadGalleryImages,
  deleteGalleryImage
};
