const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const adminMiddleware = require("../middlewares/admin.middleware");

// Unified single import for the admin dashboard controller
const adminDashboardController = require("../controllers/admin.dashboard.controller");

// Only admins can access global business metrics
router.get("/metrics", authMiddleware, adminMiddleware, adminDashboardController.getDashboardMetrics);

// Endpoint for the superadmin live fleet tracking map view canvas
router.get("/live-riders", authMiddleware, adminMiddleware, adminDashboardController.getLiveRidersTelemetry);

module.exports = router;
