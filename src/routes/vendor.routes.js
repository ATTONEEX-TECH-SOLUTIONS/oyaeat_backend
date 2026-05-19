const express = require("express");
const router = express.Router();

const vendorController        = require("../controllers/vendor.controller");
const vendorMenuController    = require("../controllers/vendor.menu.controller");
const vendorOrdersController  = require("../controllers/vendor.orders.controller");
const vendorStaffController   = require("../controllers/vendor.staff.controller");
const vendorSettingsController = require("../controllers/vendor.settings.controller");

const upload        = require("../middlewares/upload.middleware");
const authMiddleware = require("../middlewares/auth.middleware");

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

module.exports = router;
