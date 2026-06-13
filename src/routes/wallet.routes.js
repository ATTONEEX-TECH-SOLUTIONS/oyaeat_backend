const express = require("express");
const router = express.Router();
const walletController = require("../controllers/wallet.controller");

// ── 🌟 FIXED IMPORTS ──
// Simply require your main exported adminMiddleware function directly
const adminGuard = require("../middlewares/auth.middleware"); 

// ── User routes (Riders/Vendors fetch their own wallets) ──
// Note: If you need standard authMiddleware here, ensure it's imported from its proper file path
router.get("/summary", adminGuard, walletController.getUserWalletSummary);
router.post("/request-payout", adminGuard, walletController.requestWithdrawal);

// ── 🌟 FIXED ADMIN CHANNELS ──
// Use your direct adminGuard here without parentheses, since it handles role verification internally!
router.get("/admin/financial-queue-logs", adminGuard, walletController.getAdminFinancialQueueLogs);
router.post("/admin/onboard-bank", adminGuard, walletController.manuallyLinkEmailBank);
router.put("/admin/resolve-payout/:transactionId", adminGuard, walletController.resolveAdminPayout);

module.exports = router;
