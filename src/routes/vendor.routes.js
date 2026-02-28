const express = require("express");
const router = express.Router();

const vendorController = require("../controllers/vendor.controller");
const upload = require("../middlewares/upload.middleware");
const authMiddleware = require("../middlewares/auth.middleware");

// NEW controllers
const vendorMenuController = require("../controllers/vendor.menu.controller");
const vendorOrdersController = require("../controllers/vendor.orders.controller");
const vendorStaffController = require("../controllers/vendor.staff.controller");

// ✅ Protect vendor routes (requires Bearer token)
router.use(authMiddleware);

/**
 * DASHBOARD (restaurant overview)
 * GET /vendor/dashboard
 */
router.get("/dashboard", vendorController.getVendorDashboard); // we'll add this function

// -------------------
// Existing onboarding routes (keep)
// -------------------

// Step 3: Upload business details
router.post("/:userId/business-details", vendorController.uploadBusinessDetails);

// Step 4: Upload verification documents
router.post(
  "/:businessId/upload-documents",
  upload.fields([
    { name: "business_license", maxCount: 1 },
    { name: "tax_id", maxCount: 1 },
    { name: "food_certificate", maxCount: 1 },
    { name: "owner_id", maxCount: 1 },
    { name: "bank_document", maxCount: 1 },
  ]),
  vendorController.uploadVerificationDocuments
);

// Get vendor registration status
router.get("/:userId/status", vendorController.getVendorStatus);

// Step 5: Submit business bank details
router.post("/:businessId/bank", vendorController.submitBankDetails);
router.post("/bank", vendorController.submitBankDetails);

// Vendor businesses by status
router.get("/:userId/businesses", vendorController.getVendorBusinesses);

// Vendor full business detail
router.get("/business/:businessId", vendorController.getBusinessDetail);

// -------------------
// NEW: MENU CRUD
// -------------------
router.get("/menu", vendorMenuController.getMenu);
router.post("/menu", vendorMenuController.createMenuItem);
router.patch("/menu/:itemId", vendorMenuController.updateMenuItem);
router.delete("/menu/:itemId", vendorMenuController.deleteMenuItem);

// -------------------
// NEW: STAFF CRUD
// -------------------
router.get("/staff", vendorStaffController.getStaff);
router.post("/staff", vendorStaffController.createStaff);
router.patch("/staff/:staffId", vendorStaffController.updateStaff);
router.delete("/staff/:staffId", vendorStaffController.deleteStaff);

// -------------------
// NEW: ORDERS
// -------------------
router.get("/orders", vendorOrdersController.getOrders);
router.patch("/orders/:orderId/status", vendorOrdersController.updateOrderStatus);

module.exports = router;