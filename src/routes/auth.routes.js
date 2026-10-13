const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");

// Step 1: Register vendor with personal details
router.post("/register", authController.registerVendor);

// Step 2: Verify phone number with hardcoded OTP
router.post("/verify-phone", authController.verifyPhoneNumber);

// Resend the verification code
router.post("/resend-otp", authController.resendOtp);

router.post("/forgot-password", require("../controllers/password.controller").forgotPassword);
router.post("/reset-password", require("../controllers/password.controller").resetPassword);

// Login
router.post("/login", authController.login);

module.exports = router;
