const prisma    = require("../lib/prisma");
const cloudinary = require("../lib/cloudinary");

/**
 * GET /api/vendor/business/:businessId/settings
 */
const getBusinessSettings = async (req, res) => {
  try {
    const { businessId } = req.params;

    const business = await prisma.business.findUnique({
      where: { id: parseInt(businessId) },
    });

    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    if (business.ownerId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }

    res.json({
      success: true,
      data: {
        businessId:    business.id,
        businessName:  business.name,
        email:         business.businessEmail,
        phone:         business.businessPhone,
        streetAddress: business.streetAddress,
        city:          business.city,
        state:         business.state,
        zipCode:       business.zipCode,
        country:       business.country    ?? "",
        description:   business.description ?? "",
        websiteUrl:    business.websiteUrl  ?? "",

        thumbnailUrl:  business.thumbnailUrl  ?? null,
        profilePicUrl: business.profilePicUrl ?? null,

        openingHour:   business.openingHour ?? "10:00",
        closingHour:   business.closingHour ?? "23:00",

        deliveryRadius: business.deliveryRadius ?? 5,
        minimumOrder:   business.minimumOrder   ?? 0,
        deliveryFee:    business.deliveryFee    ?? 0,

        notifications: {
          newOrders:    business.notifNewOrders,
          orderUpdates: business.notifOrderUpdates,
          systemAlerts: business.notifSystemAlerts,
          promotions:   business.notifPromotions,
        },
      },
    });
  } catch (error) {
    console.error("getBusinessSettings error:", error);
    res.status(500).json({ message: "Failed to fetch settings", error: error.message });
  }
};

/**
 * PATCH /api/vendor/business/:businessId/settings
 */
const updateBusinessSettings = async (req, res) => {
  try {
    const { businessId } = req.params;
    const {
      businessName, email, phone,
      streetAddress, city, state, zipCode, country,
      description, websiteUrl,
      openingHour, closingHour,
      deliveryRadius, minimumOrder, deliveryFee,
      notifications,
    } = req.body;

    const business = await prisma.business.findUnique({
      where: { id: parseInt(businessId) },
    });

    if (!business) return res.status(404).json({ message: "Business not found" });
    if (business.ownerId !== req.user.id) return res.status(403).json({ message: "Forbidden" });

    const updated = await prisma.business.update({
      where: { id: parseInt(businessId) },
      data: {
        ...(businessName  != null && { name:          businessName }),
        ...(email         != null && { businessEmail: email }),
        ...(phone         != null && { businessPhone: phone }),
        ...(streetAddress != null && { streetAddress }),
        ...(city          != null && { city }),
        ...(state         != null && { state }),
        ...(zipCode       != null && { zipCode }),
        ...(country       != null && { country }),
        ...(description   != null && { description }),
        ...(websiteUrl    != null && { websiteUrl }),
        ...(openingHour   != null && { openingHour }),
        ...(closingHour   != null && { closingHour }),
        ...(deliveryRadius != null && { deliveryRadius: parseFloat(deliveryRadius) }),
        ...(minimumOrder   != null && { minimumOrder:   parseFloat(minimumOrder) }),
        ...(deliveryFee    != null && { deliveryFee:    parseFloat(deliveryFee) }),
        ...(notifications != null && {
          ...(notifications.newOrders    != null && { notifNewOrders:    Boolean(notifications.newOrders) }),
          ...(notifications.orderUpdates != null && { notifOrderUpdates: Boolean(notifications.orderUpdates) }),
          ...(notifications.systemAlerts != null && { notifSystemAlerts: Boolean(notifications.systemAlerts) }),
          ...(notifications.promotions   != null && { notifPromotions:   Boolean(notifications.promotions) }),
        }),
      },
    });

    res.json({ success: true, message: "Settings updated", businessId: updated.id });
  } catch (error) {
    console.error("updateBusinessSettings error:", error);
    res.status(500).json({ message: "Failed to update settings", error: error.message });
  }
};

/**
 * POST /api/vendor/business/:businessId/settings/thumbnail
 * Field name: "thumbnail"
 */
const uploadThumbnail = async (req, res) => {
  try {
    const { businessId } = req.params;

    const business = await prisma.business.findUnique({ where: { id: parseInt(businessId) } });
    if (!business) return res.status(404).json({ message: "Business not found" });
    if (business.ownerId !== req.user.id) return res.status(403).json({ message: "Forbidden" });
    if (!req.file) return res.status(400).json({ message: "No thumbnail file provided" });

    const result = await cloudinary.uploader.upload(req.file.path, {
      folder:          `oyaeat/business_images/${businessId}/thumbnail`,
      use_filename:    true,
      unique_filename: true,
      resource_type:   "image",
      transformation:  [{ width: 1200, height: 400, crop: "fill", gravity: "auto" }],
    });

    const updated = await prisma.business.update({
      where: { id: parseInt(businessId) },
      data:  { thumbnailUrl: result.secure_url },
    });

    res.json({ success: true, message: "Thumbnail uploaded", thumbnailUrl: updated.thumbnailUrl });
  } catch (error) {
    console.error("uploadThumbnail error:", error);
    res.status(500).json({ message: "Thumbnail upload failed", error: error.message });
  }
};

/**
 * POST /api/vendor/business/:businessId/settings/profile-pic
 * Field name: "profilePic"
 */
const uploadProfilePic = async (req, res) => {
  try {
    const { businessId } = req.params;

    const business = await prisma.business.findUnique({ where: { id: parseInt(businessId) } });
    if (!business) return res.status(404).json({ message: "Business not found" });
    if (business.ownerId !== req.user.id) return res.status(403).json({ message: "Forbidden" });
    if (!req.file) return res.status(400).json({ message: "No profile picture file provided" });

    const result = await cloudinary.uploader.upload(req.file.path, {
      folder:          `oyaeat/business_images/${businessId}/profile`,
      use_filename:    true,
      unique_filename: true,
      resource_type:   "image",
      transformation:  [{ width: 400, height: 400, crop: "fill", gravity: "face" }],
    });

    const updated = await prisma.business.update({
      where: { id: parseInt(businessId) },
      data:  { profilePicUrl: result.secure_url },
    });

    res.json({ success: true, message: "Profile picture uploaded", profilePicUrl: updated.profilePicUrl });
  } catch (error) {
    console.error("uploadProfilePic error:", error);
    res.status(500).json({ message: "Profile picture upload failed", error: error.message });
  }
};

module.exports = {
  getBusinessSettings,
  updateBusinessSettings,
  uploadThumbnail,
  uploadProfilePic,
};

