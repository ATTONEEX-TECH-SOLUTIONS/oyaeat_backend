const express = require("express");
const rl = require("../middlewares/rateLimit.middleware");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const requireRole = require("../middlewares/role.middleware");
const customerAuthController = require("../controllers/customer.auth.controller");

router.post("/register", customerAuthController.registerCustomer);
router.post("/login", ...rl.loginLimiters("emailOrPhone"), customerAuthController.loginCustomer);
router.get("/me", authMiddleware, requireRole("customer"), customerAuthController.getProfile);
router.patch("/me", authMiddleware, requireRole("customer"), customerAuthController.updateProfile);

router.post("/forgot-password", rl.forgotPasswordLimiter, require("../controllers/password.controller").forgotPassword);
router.post("/reset-password", rl.resetPasswordLimiter, require("../controllers/password.controller").resetPassword);

module.exports = router;