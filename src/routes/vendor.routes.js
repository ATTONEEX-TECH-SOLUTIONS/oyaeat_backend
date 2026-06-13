const express = require("express");
const router = express.Router();

const prisma = require("../lib/prisma");


const vendorController        = require("../controllers/vendor.controller");
const vendorMenuController    = require("../controllers/vendor.menu.controller");
const vendorOrdersController  = require("../controllers/vendor.orders.controller");
const vendorStaffController   = require("../controllers/vendor.staff.controller");
const vendorSettingsController = require("../controllers/vendor.settings.controller");
const promoController = require("../controllers/promo.controller");

const vendorAdvertController = require("../controllers/vendor.controller");

const upload        = require("../middlewares/upload.middleware");
const authMiddleware = require("../middlewares/auth.middleware");
const requireRole = require("../middlewares/role.middleware")

// ✅ Protect all vendor routes
router.use(authMiddleware);

// ─── Dashboard ───────────────────────────────────────────────
router.get("/dashboard", vendorController.getVendorDashboard);

// ─── Onboarding ──────────────────────────────────────────────
router.post("/:userId/business-details", vendorController.uploadBusinessDetails);

router.post(
  "/:businessId/upload-documents",
  upload.fields([
    { name: "business_license",  maxCount: 1 },
    { name: "tax_id",            maxCount: 1 },
    { name: "food_certificate",  maxCount: 1 },
    { name: "owner_id",          maxCount: 1 },
    { name: "bank_document",     maxCount: 1 },
  ]),
  vendorController.uploadVerificationDocuments
);

router.post(
  "/:businessId/upload-gallery", 
  upload.fields([{ name: "gallery", maxCount: 5 }]),
  vendorController.uploadGalleryImages
);

router.delete("/gallery/:imageId", vendorController.deleteGalleryImage);

router.get( "/:userId/status",     vendorController.getVendorStatus);
router.post("/:businessId/bank",   vendorController.submitBankDetails);
router.post("/bank",               vendorController.submitBankDetails);
router.get( "/:userId/businesses", vendorController.getVendorBusinesses);
router.get( "/business/:businessId", vendorController.getBusinessDetail);

// ─── Settings ────────────────────────────────────────────────
router.get(  "/business/:businessId/settings",             vendorSettingsController.getBusinessSettings);
router.patch("/business/:businessId/settings",             vendorSettingsController.updateBusinessSettings);
router.post( "/business/:businessId/settings/thumbnail",   upload.single("thumbnail"),  vendorSettingsController.uploadThumbnail);
router.post( "/business/:businessId/settings/profile-pic", upload.single("profilePic"), vendorSettingsController.uploadProfilePic);

// ─── Menu ────────────────────────────────────────────────────
router.get(   "/menu",        vendorMenuController.getMenu);
router.post(  "/menu",        upload.single("image"), vendorMenuController.createMenuItem);
router.patch( "/menu/:itemId",upload.single("image"), vendorMenuController.updateMenuItem);
router.delete("/menu/:itemId",vendorMenuController.deleteMenuItem);

// ─── Staff ───────────────────────────────────────────────────
router.get(   "/staff",           vendorStaffController.getStaff);
router.post(  "/staff",           vendorStaffController.createStaff);
router.patch( "/staff/:staffId",  vendorStaffController.updateStaff);
router.delete("/staff/:staffId",  vendorStaffController.deleteStaff);

// ─── Orders ──────────────────────────────────────────────────
router.get(  "/orders",                    vendorOrdersController.getOrders);
router.patch("/orders/:orderId/status",    vendorOrdersController.updateOrderStatus);


router.post("/advert/submit", authMiddleware, requireRole("owner"), vendorAdvertController.submitVendorAdvert);

// ... [Keep all your existing dashboard, onboarding, menu, and orders routes exactly as they are]

// ─── Orders ──────────────────────────────────────────────────
router.get(  "/orders",                    vendorOrdersController.getOrders);
router.patch("/orders/:orderId/status",    vendorOrdersController.updateOrderStatus);

// ─── Text Advert Submissions (Existing) ──────────────────────
router.post("/advert/submit", authMiddleware, requireRole("owner"), vendorAdvertController.submitVendorAdvert);

// ─── 🚀 NEW BANNERS & BROADCASTS WORKFLOW ENDPOINTS ──────────────────
// Fetch this specific vendor's history entries
router.get(
  "/broadcasts/my-active", 
  authMiddleware, 
  promoController.getMyActivePromos
);

// Submit a banner graphic upload request up for admin validation review
router.post(
  "/broadcasts/request-approval", 
  authMiddleware, 
  upload.single("image"), 
  promoController.createPromoVendorRequest
);

// Self-deactivate or flip timeline preferences on your own ads
router.patch(
  "/broadcasts/:id/toggle", 
  authMiddleware, 
 promoController.togglePromoStatus
);



// 1. Fetch live notifications matching the logged-in owner's business
router.get("/notifications", authMiddleware, async (req, res) => {
  try {
    const vendorBusiness = await prisma.business.findFirst({
      where: { ownerId: req.user.id }
    });
    if (!vendorBusiness) return res.status(404).json({ success: false, message: "Business not found." });

    const notifications = await prisma.notification.findMany({
      where: { businessId: vendorBusiness.id },
      orderBy: { id: "desc" }
    });
    return res.json({ success: true, data: notifications });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// 2. Clear out all unread notification badges
router.post("/notifications/mark-read", authMiddleware, async (req, res) => {
  try {
    const vendorBusiness = await prisma.business.findFirst({
      where: { ownerId: req.user.id }
    });
    if (!vendorBusiness) return res.status(404).json({ success: false, message: "Business not found." });

    await prisma.notification.updateMany({
      where: { businessId: vendorBusiness.id },
      data: { read: true }
    });
    return res.json({ success: true, message: "All notifications marked as read." });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});



module.exports = router;
