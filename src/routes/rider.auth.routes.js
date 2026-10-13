const express = require("express");
const router = express.Router();
const riderAuthController = require("../controllers/rider.auth.controller");
const upload = require("../middlewares/upload.middleware");

// Register rider
router.post("/register", upload.single("idDocument"), riderAuthController.registerRider);

// Login rider
router.post("/login", riderAuthController.login);

router.post("/forgot-password", require("../controllers/password.controller").forgotPassword);
router.post("/reset-password", require("../controllers/password.controller").resetPassword);

module.exports = router;
