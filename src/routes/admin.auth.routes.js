const express = require("express");
const rl = require("../middlewares/rateLimit.middleware");
const router = express.Router();
const adminAuthController = require("../controllers/admin.auth.controller");

router.post("/login", ...rl.loginLimiters("email"), adminAuthController.login);

router.post("/forgot-password", rl.forgotPasswordLimiter, require("../controllers/password.controller").forgotPassword);
router.post("/reset-password", rl.resetPasswordLimiter, require("../controllers/password.controller").resetPassword);

module.exports = router;
