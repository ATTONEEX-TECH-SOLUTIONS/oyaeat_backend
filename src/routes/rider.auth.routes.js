const express = require("express");
const rl = require("../middlewares/rateLimit.middleware");
const router = express.Router();
const riderAuthController = require("../controllers/rider.auth.controller");
const upload = require("../middlewares/upload.middleware");

// Register rider
router.post("/register", upload.single("idDocument"), riderAuthController.registerRider);

// Login rider
router.post("/login", ...rl.loginLimiters("email"), riderAuthController.login);

router.post("/forgot-password", rl.forgotPasswordLimiter, require("../controllers/password.controller").forgotPassword);
router.post("/reset-password", rl.resetPasswordLimiter, require("../controllers/password.controller").resetPassword);

module.exports = router;
