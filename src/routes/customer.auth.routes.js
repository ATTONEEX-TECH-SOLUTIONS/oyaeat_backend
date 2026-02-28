const express = require("express");
const router = express.Router();

const customerAuthController = require("../controllers/customer.auth.controller");

router.post("/register", customerAuthController.registerCustomer);
router.post("/login", customerAuthController.loginCustomer);

module.exports = router;