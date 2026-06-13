const express = require("express");
const router = express.Router();
const riderAuthController = require("../controllers/rider.auth.controller");
const upload = require("../middlewares/upload.middleware");

// Register rider
router.post("/register", upload.single("idDocument"), riderAuthController.registerRider);

// Login rider
router.post("/login", riderAuthController.login);

module.exports = router;
