const express = require("express");
const router = express.Router();
const adminAuthController = require("../controllers/admin.auth.controller");

router.post("/login", adminAuthController.login);

router.post("/forgot-password", require("../controllers/password.controller").forgotPassword);
router.post("/reset-password", require("../controllers/password.controller").resetPassword);

module.exports = router;
