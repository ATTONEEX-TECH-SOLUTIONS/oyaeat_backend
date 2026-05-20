const express = require("express");
const router = express.Router();
const riderController = require("../controllers/rider.controller");
const supportController = require("../controllers/support.controller");
const earningsController = require("../controllers/earnings.controller");
const authMiddleware = require("../middlewares/auth.middleware");
const requireRole = require("../middlewares/role.middleware");
const upload = require("../middlewares/upload.middleware"); // Your multer configuration path

// Protect all rider routes and ensure the user is a rider
router.use(authMiddleware);
router.use(requireRole("rider"));

// Dashboard View
router.get("/dashboard", riderController.getDashboard);

// Shift Actions (Go Online / Go Offline)
router.post("/shift/toggle", riderController.toggleShift);

// ── NEW: LIVE TELEMETRY UPDATE ENDPOINT ─────────────────────────────────
// Expects JSON: { "latitude": 6.5244, "longitude": 3.3792 }
router.put("/location/ping", riderController.updateLiveLocation);
// ────────────────────────────────────────────────────────────────────────

// Delivery Action (Claim a processing order)
router.put("/orders/:orderId/accept", riderController.acceptOrder);

// Expose drop-off completion endpoint
router.put("/orders/:orderId/complete", riderController.completeDelivery);

router.get("/support/threads", supportController.getSupportThreads);
router.post("/support/message", supportController.sendSupportMessage);

router.get("/earnings/summary", earningsController.getRiderEarnings);

router.put("/profile/update", upload.single("avatar"), riderController.updateRiderProfile);

// Note: If these endpoints are accessed by a Superadmin, make sure they aren't 
// blocked by the global router.use(requireRole("rider")) scope above.
router.get("/admin/all", riderController.getAllRiders);
router.patch("/admin/:id/status", riderController.updateRiderStatus);
router.delete("/admin/:id", riderController.rejectRiderApplication);

module.exports = router;
