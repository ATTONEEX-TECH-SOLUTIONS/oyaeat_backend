const prisma = require("../lib/prisma");
const cloudinary = require('cloudinary').v2; 

/**
 * Creates a brand new image-based advertisement broadcast campaign banner.
 * Matches your exact vendor menu item pattern.
 */
exports.createPromo = async (req, res) => {
  try {
    // 1. Double check case-insensitive Admin permissions role level layer
    const userRole = (req.user?.role || "").toLowerCase();
    if (userRole !== "admin") {
      return res.status(403).json({ 
        success: false, 
        message: "Access denied. Valid admin role privileges required." 
      });
    }

    // 2. Enforce physical multipart file chunk attachment rules
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: "Please select a broadcast banner image file to upload." 
      });
    }

    let uploadedImageUrl = "";

    // 3. Robust Stream/Path parsing handler supporting both Memory and Disk storage configurations
    if (req.file.buffer) {
      // Setup A: If upload.middleware uses memoryStorage()
      const uploadStream = () => {
        return new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: "oyaeat/broadcasts" },
            (error, result) => {
              if (result) resolve(result.secure_url);
              else reject(error);
            }
          );
          stream.end(req.file.buffer);
        });
      };
      uploadedImageUrl = await uploadStream();
    } else if (req.file.path) {
      // Setup B: If upload.middleware uses diskStorage() and caches files locally first
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "oyaeat/broadcasts"
      });
      uploadedImageUrl = result.secure_url;
    } else {
      return res.status(400).json({
        success: false,
        message: "Unable to extract binary file payload stream. Check middleware configuration."
      });
    }

    // 4. Transform string hours request metrics into valid upcoming JS Date timestamps
    const duration = parseInt(req.body.durationHours) || 24;
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + duration);

    // 5. Create database row structure mapping strings into integers safely
    const newPromo = await prisma.promo.create({
      data: {
        businessId: parseInt(req.body.businessId),
        title: req.body.title,
        desc: req.body.desc,
        bgGradient: uploadedImageUrl, // 🚀 Secure remote cloud URL string goes here
        expiresAt: expiresAt,
        isActive: true
      },
      include: {
        business: {
          select: { name: true }
        }
      }
    });

    return res.status(201).json({ success: true, data: newPromo });

  } catch (error) {
    console.error("Promo Controller Creation Crash:", error.message || error);
    return res.status(500).json({ success: false, message: error.message || "Internal transmission failure." });
  }
};

/**
 * Active Visibility Status Switch Toggle Endpoint
 */
/**
 * Active Visibility Status Switch Toggle Endpoint using ExpiresAt fallbacks
 */
exports.togglePromoStatus = async (req, res) => {
  try {
    const promoId = parseInt(req.params.id, 10);
    const { isActive } = req.body; // Sent from frontend click button

    let updatedExpirationDate;

    if (isActive) {
      // If turning ON: Set expiration to 24 hours in the future
      updatedExpirationDate = new Date();
      updatedExpirationDate.setHours(updatedExpirationDate.getHours() + 24);
    } else {
      // If turning OFF (Deactivating): Set expiration to right now (instantly expired)
      updatedExpirationDate = new Date();
    }

    const updatedPromo = await prisma.promo.update({
      where: { id: promoId },
      data: { 
        expiresAt: updatedExpirationDate // 💡 Updates expiration timestamp instead of missing isActive flag
      }
    });

    return res.json({ success: true, data: updatedPromo });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};


/**
 * Super Admin Panel Active List Table Loader Hook
 */
exports.getActivePromos = async (req, res) => {
  try {
    const promos = await prisma.promo.findMany({
      orderBy: { 
        id: 'desc' // 💡 Fixed: Sorts by auto-incrementing ID to fallback safely without a createdAt column
      },
      include: {
        business: { select: { name: true } }
      }
    });
    return res.json({ success: true, data: promos });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Public Customer Application Banner Stream Feed Controller
 * Excludes manually disabled assets and expired campaigns automatically.
 */
exports.getPublicPromoFeed = async (req, res) => {
  try {
    const now = new Date();

    const activeBanners = await prisma.promo.findMany({
      where: {
        isActive: true,        // ONLY load rows where status is explicitly true
        expiresAt: { gt: now } // ONLY load rows where expiration hasn't passed
      },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            thumbnailUrl: true
          }
        }
      },
      orderBy: {
        id: 'desc' // 💡 Fixed: Swapped missing createdAt key with valid ID descending indexing order
      }
    });

    return res.json({ success: true, data: activeBanners });
  } catch (error) {
    console.error("Public Promo Feed Runtime Catch:", error.message);
    return res.status(500).json({ success: false, message: "Failed loading active campaigns carousel feed." });
  }
};
