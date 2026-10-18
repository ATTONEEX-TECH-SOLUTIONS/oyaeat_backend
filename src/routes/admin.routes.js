const express = require('express');
const router = express.Router();

// Controllers
const adminController = require('../controllers/admin.controller');
const broadcastController = require('../controllers/broadcast.controller');
const promoController = require('../controllers/promo.controller');
const settingsController = require("../controllers/settings.controller");

// Middlewares
const authMiddleware = require('../middlewares/auth.middleware');
const adminMiddleware = require('../middlewares/admin.middleware');
const upload = require("../middlewares/upload.middleware"); 


const prisma = require("../lib/prisma"); 


router.use(authMiddleware);
router.use(adminMiddleware);


router.get("/broadcasts/approved-list", authMiddleware, async (req, res) => {
  try {
    const approved = await prisma.business.findMany({
      where: { status: "approved" },
      select: { id: true, name: true, city: true }
    });
    // `data` is what the frontend reads; `businesses` kept for older callers
    return res.json({ success: true, data: approved, businesses: approved });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.patch(
  "/broadcasts/:id/toggle", 
  authMiddleware, 
  promoController.togglePromoStatus )
router.post("/broadcasts/:id/toggle", promoController.togglePromoStatus);




router.get('/broadcasts/pending-reviews', promoController.getPendingVendorPromos);


router.patch("/broadcasts/:id/approve", promoController.approveVendorPromo);
router.post("/broadcasts/:id/approve", promoController.approveVendorPromo);


router.patch("/broadcasts/:id/reject", promoController.rejectVendorPromo);
router.post("/broadcasts/:id/reject", promoController.rejectVendorPromo);


router.get('/broadcasts/active', promoController.getActivePromos);



router.get('/businesses/stats', adminController.getBusinessStats);


router.get('/businesses/pending', adminController.getPendingBusinesses);

router.get('/businesses/approved', adminController.getApprovedBusinesses);
router.get('/businesses/rejected', adminController.getRejectedBusinesses);
router.get('/businesses/suspended', adminController.getSuspendedBusinesses);


router.get('/businesses', adminController.getAllBusinesses);


router.get('/businesses/:businessId', adminController.getBusinessById);


router.post('/businesses/:businessId/approve', adminController.approveBusiness);

// Reject business
router.post('/businesses/:businessId/reject', adminController.rejectBusiness);

// Suspend business
router.post('/businesses/:businessId/suspend', adminController.suspendBusiness);

// Single status endpoint: { status: approved|rejected|suspended, reason?, suspensionType? }
router.patch('/businesses/:businessId/status', adminController.updateBusinessStatus);

// Get all global orders
router.get('/orders', adminController.getGlobalOrders);

// Send Custom System PUSH Broadcast Alert Notification 
router.post('/broadcast', broadcastController.sendBroadcast);
router.get('/broadcasts/rejected-history', promoController.getRejectedVendorPromosHistory);
router.delete("/broadcasts/:id", promoController.deletePromoBannerInstance);


router.get("/settings", authMiddleware, settingsController.getSystemSettings);
router.patch("/settings", authMiddleware, settingsController.updateSystemSettings);
router.put("/settings", settingsController.updateSystemSettings);

// ─── Restaurant payment accounts (Paystack subaccounts) ───────
const paymentAccount = require("../controllers/paymentAccount.controller");
router.get("/banks", paymentAccount.listBanks);
router.get("/payment-accounts", paymentAccount.listPaymentAccounts);
router.post("/payment-accounts/resolve", paymentAccount.resolveAccount);
router.get("/businesses/:businessId/payment-account", paymentAccount.getPaymentAccount);
router.put("/businesses/:businessId/payment-account", paymentAccount.setPaymentAccount);
router.delete("/businesses/:businessId/payment-account", paymentAccount.deactivatePaymentAccount);

// Payout tooling is also reachable under /admin (canonical home is /api/wallet/admin)
const walletController = require("../controllers/wallet.controller");
router.post("/onboard-bank", walletController.manuallyLinkEmailBank);
router.post("/resolve-payout/:transactionId", walletController.resolveAdminPayout);
router.put("/resolve-payout/:transactionId", walletController.resolveAdminPayout);

module.exports = router;
