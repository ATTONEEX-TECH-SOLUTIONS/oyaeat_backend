const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const requireRole = require("../middlewares/role.middleware");
const ordersController = require("../controllers/orders.controller");

router.use(authMiddleware);

// ── Customer routes ──
router.post("/", requireRole("customer"), ordersController.createOrder);
router.get("/my", requireRole("customer"), ordersController.getMyOrders);
router.post("/initialize-payment", requireRole("customer"), ordersController.initializePayment);
router.get("/verify-payment/:reference", requireRole("customer"), ordersController.verifyPayment);
router.get("/:id/track-rider", requireRole("customer"), ordersController.getCustomerRiderTracking);

// ── Vendor route: the restaurant dispatches its own ready order to riders ──
router.post("/:id/dispatch", requireRole("owner", "admin"), ordersController.dispatchOrderToRiders);

module.exports = router;
