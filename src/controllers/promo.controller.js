const prisma = require("../lib/prisma");
const cloudinary = require("cloudinary").v2;

exports.createPromoVendorRequest = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res
        .status(401)
        .json({
          success: false,
          message: "Unauthorized. Session context missing.",
        });
    }

    const vendorBusiness = await prisma.business.findFirst({
      where: { ownerId: req.user.id },
    });

    if (!vendorBusiness) {
      return res.status(404).json({
        success: false,
        message:
          "No registered business found matching your vendor profile account parameters.",
      });
    }

    if (!req.file) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Please select a campaign graphic file to upload.",
        });
    }

    let uploadedImageUrl = "";

    if (req.file.buffer) {
      const uploadStream = () => {
        return new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: "oyaeat/broadcasts" },
            (error, result) => {
              if (result) resolve(result.secure_url);
              else reject(error);
            },
          );
          stream.end(req.file.buffer);
        });
      };
      uploadedImageUrl = await uploadStream();
    } else if (req.file.path) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "oyaeat/broadcasts",
      });
      uploadedImageUrl = result.secure_url;
    }

    const duration = parseInt(req.body.durationHours) || 24;
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + duration);

    const newPromo = await prisma.promo.create({
      data: {
        businessId: vendorBusiness.id,
        title: req.body.title,
        desc: req.body.desc,
        bgGradient: uploadedImageUrl,
        expiresAt: expiresAt,
        isActive: false,
        code: req.body.code ? req.body.code : null,
        discount: req.body.discount ? parseFloat(req.body.discount) : null,
      },
      include: {
        business: { select: { name: true } },
      },
    });

    return res.status(201).json({
      success: true,
      message:
        "Campaign sent to administration teams for live review approval.",
      data: newPromo,
    });
  } catch (error) {
    console.error("Vendor Promo Engine Crash:", error);
    return res
      .status(500)
      .json({
        success: false,
        message: "Internal server transmission failure.",
      });
  }
};

exports.getMyActivePromos = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res
        .status(401)
        .json({
          success: false,
          message: "Unauthorized profile state credentials.",
        });
    }

    const vendorBusiness = await prisma.business.findFirst({
      where: { ownerId: req.user.id },
    });

    if (!vendorBusiness) {
      return res
        .status(404)
        .json({
          success: false,
          message: "Associated vendor venue record parameters not found.",
        });
    }

    const promos = await prisma.promo.findMany({
      where: { businessId: vendorBusiness.id },
      orderBy: { id: "desc" },
      include: {
        business: { select: { name: true } },
      },
    });

    return res.json({ success: true, data: promos });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};












exports.getActivePromos = async (req, res) => {
  try {
    const promos = await prisma.promo.findMany({
      orderBy: { id: "desc" },
      include: {
        business: { select: { name: true } },
      },
    });
    return res.json({ success: true, data: promos });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getPublicPromoFeed = async (req, res) => {
  try {
    const now = new Date();
    const activeBanners = await prisma.promo.findMany({
      where: {
        isActive: true,
        expiresAt: { gt: now },
      },
      include: {
        business: {
          select: { id: true, name: true, thumbnailUrl: true },
        },
      },
      orderBy: { id: "desc" },
    });
    return res.json({ success: true, data: activeBanners });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: "Failed loading carousel feed." });
  }
};





exports.getPendingVendorPromos = async (req, res) => {
  try {
    const pendingPromos = await prisma.promo.findMany({
      where: { 
        isActive: false,
        expiresAt: { gt: new Date() } // 🚀 ONLY future expirations (not rejected)
      },
      orderBy: { id: "desc" },
      include: { business: { select: { name: true, city: true } } }
    });
    return res.json({ success: true, data: pendingPromos });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};


exports.getRejectedVendorPromosHistory = async (req, res) => {
  try {
    const rejections = await prisma.promo.findMany({
      where: { 
        isActive: false,
        expiresAt: { lt: new Date("2020-01-01") } // 🚀 Catches our historical rejection marker date
      },
      orderBy: { id: "desc" },
      include: { business: { select: { name: true } } }
    });
    return res.json({ success: true, data: rejections });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};


exports.deletePromoBannerInstance = async (req, res) => {
  try {
    const promoId = parseInt(req.params.id, 10);

    if (isNaN(promoId)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid parameters. A valid numerical promo ID is required." 
      });
    }

    // 1. Fetch the target promo from your database first to retrieve its image URL path
    const targetPromo = await prisma.promo.findUnique({
      where: { id: promoId }
    });

    if (!targetPromo) {
      return res.status(404).json({ success: false, message: "Advertisement campaign record not found." });
    }

    // 2. Clear out the image asset from Cloudinary storage buckets if it exists
    if (targetPromo.bgGradient && targetPromo.bgGradient.includes("cloudinary.com")) {
      try {
        // Splitting segments isolates everything after the root cloud version markers
        const urlParts = targetPromo.bgGradient.split('/');
        const uploadIndex = urlParts.findIndex(part => part.startsWith('v') && !isNaN(part.slice(1)));
        
        if (uploadIndex !== -1) {
          // Extracts ['oyaeat', 'broadcasts', 'p6iqu2222watn1vx4rjo.png']
          const pathSegments = urlParts.slice(uploadIndex + 1);
          // Combines into 'oyaeat/broadcasts/p6iqu2222watn1vx4rjo' while removing the file extension extension
          const publicIdWithExtension = pathSegments.join('/');
          const publicId = publicIdWithExtension.substring(0, publicIdWithExtension.lastIndexOf('.'));

          // Dispatches remote unlinking execution sequence block
          await cloudinary.uploader.destroy(publicId);
          console.log(`Cloudinary asset destroyed successfully: ${publicId}`);
        }
      } catch (cloudErr) {
        // Non-blocking catch keeps your DB record clean even if Cloudinary file was already deleted manually
        console.error("Failed to destroy associated Cloudinary asset file:", cloudErr);
      }
    }

    // 3. Hard delete row from database completely
    await prisma.promo.delete({
      where: { id: promoId }
    });

    return res.json({ 
      success: true, 
      message: "Advertisement campaign and associated image file permanently purged from system records." 
    });
  } catch (error) {
    console.error("Delete Controller Error:", error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Could not execute database data purge routine." 
    });
  }
};



/**
 * 👑 ADMIN CONTROLLER: Approve a vendor's ad banner campaign
 */
exports.approveVendorPromo = async (req, res) => {
  try {
    const promoId = parseInt(req.params.id, 10);
    const updatedExpirationDate = new Date();
    updatedExpirationDate.setHours(updatedExpirationDate.getHours() + 24);

    const approvedPromo = await prisma.promo.update({
      where: { id: promoId },
      data: {
        isActive: true,
        expiresAt: updatedExpirationDate
      }
    });

    // 🚀 INJECT NOTIFICATION: Tell the vendor their ad went live
    await prisma.notification.create({
      data: {
        businessId: approvedPromo.businessId,
        title: "📢 Campaign Approved Live!",
        text: `Your advertisement campaign "${approvedPromo.title}" has been approved by admin and is now broadcasting live to customers.`
      }
    });

    return res.json({ success: true, message: "Vendor campaign approved live!", data: approvedPromo });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 👑 ADMIN CONTROLLER: Reject/Take down a vendor's campaign request
 */
exports.rejectVendorPromo = async (req, res) => {
  try {
    const promoId = parseInt(req.params.id, 10);

    const rejectedPromo = await prisma.promo.update({
      where: { id: promoId },
      data: {
        isActive: false, 
        expiresAt: new Date("2016-01-01") 
      }
    });

    // 🚀 INJECT NOTIFICATION: Tell the vendor their ad was rejected
    await prisma.notification.create({
      data: {
        businessId: rejectedPromo.businessId,
        title: "❌ Campaign Request Rejected",
        text: `Your advertisement submission "${rejectedPromo.title}" did not pass administrative review and was rejected.`
      }
    });

    return res.json({ success: true, message: "Vendor request rejected and archived.", data: rejectedPromo });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 👑 ADMIN CONTROLLER: Active Visibility Status Switch Toggle Endpoint (Hide/Unhide)
 */
exports.togglePromoStatus = async (req, res) => {
  try {
    const promoId = parseInt(req.params.id, 10);
    const { isActive } = req.body;

    let updatedExpirationDate = new Date();
    if (isActive) updatedExpirationDate.setHours(updatedExpirationDate.getHours() + 24);

    const updatedPromo = await prisma.promo.update({
      where: { id: promoId },
      data: { 
        isActive: isActive,
        expiresAt: updatedExpirationDate 
      }
    });

    // 🚀 INJECT NOTIFICATION: Notify vendor that visibility changed
    await prisma.notification.create({
      data: {
        businessId: updatedPromo.businessId,
        title: isActive ? "👀 Campaign Visibility Restored" : "🙈 Campaign Hidden by Admin",
        text: isActive 
          ? `Your campaign banner "${updatedPromo.title}" has been reactivated on streams.`
          : `Your campaign banner "${updatedPromo.title}" was hidden from public feeds by system operators.`
      }
    });

    return res.json({ success: true, data: updatedPromo });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
