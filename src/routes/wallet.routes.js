const express = require("express");
const router = express.Router();
const walletController = require("../controllers/wallet.controller");

const authMiddleware = require("../middlewares/auth.middleware");
const adminMiddleware = require("../middlewares/admin.middleware");
const requireRole = require("../middlewares/role.middleware");

// ── User routes (vendors = "owner", and riders fetch their own wallets) ──
router.get("/summary", authMiddleware, requireRole("owner", "rider", "admin"), walletController.getUserWalletSummary);
router.post("/request-payout", authMiddleware, requireRole("owner", "rider"), walletController.requestWithdrawal);

// ── Admin-only financial channels ──
router.use("/admin", authMiddleware, adminMiddleware);
router.get("/admin/financial-queue-logs", walletController.getAdminFinancialQueueLogs);
router.post("/admin/onboard-bank", walletController.manuallyLinkEmailBank);
router.put("/admin/resolve-payout/:transactionId", walletController.resolveAdminPayout);

module.exports = router;
