const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const adminMiddleware = require("../middlewares/admin.middleware");
const dashboardController = require("../controllers/admin.dashboard.controller");

// Only admins can access
router.get("/metrics", authMiddleware, adminMiddleware, dashboardController.getDashboardMetrics);

module.exports = router;