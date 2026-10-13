const express = require("express");
const rl = require("../middlewares/rateLimit.middleware");
const router = express.Router();
const authController = require("../controllers/auth.controller");

// Step 1: Register vendor with personal details
router.post("/register", authController.registerVendor);

// Step 2: Verify phone number with hardcoded OTP
router.post("/verify-phone", ...rl.verifyLimiters(), authController.verifyPhoneNumber);

// Resend the verification code
router.post("/resend-otp", rl.resendOtpLimiter, authController.resendOtp);

router.post("/forgot-password", rl.forgotPasswordLimiter, require("../controllers/password.controller").forgotPassword);
router.post("/reset-password", rl.resetPasswordLimiter, require("../controllers/password.controller").resetPassword);

// Login
router.post("/login", ...rl.loginLimiters("email"), authController.login);

module.exports = router;
