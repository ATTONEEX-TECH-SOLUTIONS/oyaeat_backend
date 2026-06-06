const express = require('express');
const router = express.Router();

// Controllers
const adminController = require('../controllers/admin.controller');
const broadcastController = require('../controllers/broadcast.controller');
const promoController = require('../controllers/promo.controller');
const getPendingVendorAdverts = require('../controllers/broadcast.controller'); 

// Middlewares
const authMiddleware = require('../middlewares/auth.middleware');
const adminMiddleware = require('../middlewares/admin.middleware');
const upload = require("../middlewares/upload.middleware"); 

// Global database access layer
const prisma = require("../lib/prisma"); 

// ──  LEVEL 1 PROTECTED: CUSTOMER-FACING BROADCAST & PROMO PIPELINES ──

// 1. Fetch Approved Dropdown List (Un-gated from strict regex validation loops)
router.get("/broadcasts/approved-list", authMiddleware, async (req, res) => {
  try {
    const approved = await prisma.business.findMany({
      where: { status: "approved" },
      select: { id: true, name: true, city: true }
    });
    return res.json({ success: true, businesses: approved });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// 2. Standardized Broadcast Creation Endpoint (Matches your exact Vendor Menu pattern)
router.post(
  "/broadcasts/create", 
  authMiddleware, 
  upload.single("image"), // 🚀 intercept and process 'image' buffer streams from frontend form cargo
  promoController.createPromo // Offloads upload tracking, DB writes, and admin role validation to the controller
);

// 3. Status Switch Visibility Toggle Handler
router.patch(
  "/broadcasts/:id/toggle", 
  authMiddleware, 
  promoController.togglePromoStatus
);


// ── 🔒 LEVEL 2 PROTECTED: GLOBAL STRICT MOUNT FOR SYSTEM-WIDE ADMINISTRATION ROUTING ──
router.use(authMiddleware);
router.use(adminMiddleware);

// Get business statistics
router.get('/businesses/stats', adminController.getBusinessStats);

// Get all pending businesses
router.get('/businesses/pending', adminController.getPendingBusinesses);

// Status-specific lists
router.get('/businesses/approved', adminController.getApprovedBusinesses);
router.get('/businesses/rejected', adminController.getRejectedBusinesses);
router.get('/businesses/suspended', adminController.getSuspendedBusinesses);

// Get all businesses (with filters)
router.get('/businesses', adminController.getAllBusinesses);

// Get business by ID
router.get('/businesses/:businessId', adminController.getBusinessById);

// Approve business
router.post('/businesses/:businessId/approve', adminController.approveBusiness);

// Reject business
router.post('/businesses/:businessId/reject', adminController.rejectBusiness);

// Suspend business
router.post('/businesses/:businessId/suspend', adminController.suspendBusiness);

// Get all global orders
router.get('/orders', adminController.getGlobalOrders);

// Send Custom System PUSH Broadcast Alert Notification 
router.post('/broadcast', broadcastController.sendBroadcast);

// Active promos stream listing cache map
router.get('/broadcasts/active', promoController.getActivePromos);

// 2. Add the GET path underneath your authentication middlewares
router.get('/broadcasts/pending-adverts', authMiddleware, adminMiddleware, broadcastController.getPendingVendorAdverts);
router.patch("/advert/:threadId/approve", authMiddleware, adminMiddleware, adminController.sanitizeAndBroadcastAdvert);





module.exports = router;
