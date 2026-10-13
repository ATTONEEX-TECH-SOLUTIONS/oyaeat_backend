const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");

// Step 1: Register vendor with personal details
router.post("/register", authController.registerVendor);

// Step 2: Verify phone number with hardcoded OTP
router.post("/verify-phone", authController.verifyPhoneNumber);

// Resend the verification code
router.post("/resend-otp", authController.resendOtp);

// Login
router.post("/login", authController.login);

module.exports = router;
