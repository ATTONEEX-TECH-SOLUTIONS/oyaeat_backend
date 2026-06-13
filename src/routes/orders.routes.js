const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const requireRole = require("../middlewares/role.middleware");
const ordersController = require("../controllers/orders.controller");

// Global middleware for all routes in this file
router.use(authMiddleware);
router.use(requireRole("customer"));

router.post("/", ordersController.createOrder);
router.get("/my", ordersController.getMyOrders);

router.post("/initialize-payment", ordersController.initializePayment);
router.get("/verify-payment/:reference", ordersController.verifyPayment);

// ── FIXED LINES: Removed duplicate authMiddleware ──
router.post("/:id/dispatch", ordersController.dispatchOrderToRiders);
router.get("/:id/track-rider", ordersController.getCustomerRiderTracking);

module.exports = router;
