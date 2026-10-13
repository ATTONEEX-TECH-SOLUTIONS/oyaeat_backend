const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const requireRole = require("../middlewares/role.middleware");
const customerAuthController = require("../controllers/customer.auth.controller");

router.post("/register", customerAuthController.registerCustomer);
router.post("/login", customerAuthController.loginCustomer);
router.get("/me", authMiddleware, requireRole("customer"), customerAuthController.getProfile);
router.patch("/me", authMiddleware, requireRole("customer"), customerAuthController.updateProfile);

module.exports = router;