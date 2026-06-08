const express = require("express");
const router = express.Router();

const publicController = require("../controllers/public.controller");
const promoController = require("../controllers/promo.controller");

// --- Core Auth & Upload File Middlewares ---
const authMiddleware = require("../middlewares/auth.middleware"); // Adjust relative path
const requireRole = require("../middlewares/role.middleware");       // Adjust relative path
const upload = require("../middlewares/upload.middleware");           // Your multer instance

/* ==========================================
   1. PUBLIC CONSUMER FEED ROUTES
   ========================================== */
router.get("/restaurants", publicController.listRestaurants);
router.get("/restaurants/:businessId/menu", publicController.getRestaurantMenu);
router.get("/promos/public-feed", promoController.getPublicPromoFeed);

/* ==========================================
   2. RECONFIGURED VENDOR PANEL ENDPOINTS
   ========================================== */
// Securely pulls only the logged-in vendor's broadcasts
router.get(
  "/vendor/broadcasts/my-active", 
  authMiddleware, 
  requireRole("vendor"), 
  promoController.getMyActivePromos
);

// Vendor creates a banner; explicitly locked to their own company context profile
router.post(
  "/vendor/broadcasts/request-approval", 
  authMiddleware, 
  requireRole("vendor"), 
  upload.single("image"), 
  promoController.createPromoVendorRequest
);

// Toggle visibility lifespan
router.patch(
  "/vendor/broadcasts/:id/toggle", 
  authMiddleware, 
  requireRole("vendor"), 
  promoController.togglePromoStatus // ✨ Points to the valid, reconfigured function
)

/* ==========================================
   3. BACKWARD-COMPATIBLE ADMIN / SUPERADMIN ROUTES
   ========================================== */
const adminMiddleware = require("../middlewares/admin.middleware"); 
router.get("/promos", authMiddleware, adminMiddleware, promoController.getActivePromos);

module.exports = router;
