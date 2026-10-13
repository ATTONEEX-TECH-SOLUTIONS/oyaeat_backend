const express = require("express");
const router = express.Router();
const riderController = require("../controllers/rider.controller");
const authMiddleware = require("../middlewares/auth.middleware");
const adminMiddleware = require("../middlewares/admin.middleware");

// Enforce authentication and administrative access across all endpoints in this file
router.use(authMiddleware);
router.use(adminMiddleware);

/**
 * Admin Action: View all system riders
 * Route Prefix: GET /api/rider/admin/all
 */
router.get("/all", riderController.getAllRiders);

/**
 * Admin Action: Patch status configurations
 * Route Prefix: PATCH /api/rider/admin/:id/status
 */
router.patch("/:id/status", riderController.updateRiderStatus);

/** Admin Action: Edit rider details — PATCH /api/rider/admin/:id */
router.patch("/:id", riderController.updateRiderByAdmin);

/**
 * Admin Action: Reject and drop registration applications
 * Route Prefix: DELETE /api/rider/admin/:id
 */
router.delete("/:id", riderController.rejectRiderApplication);

module.exports = router;
