const express = require("express");
const router = express.Router();

const publicController = require("../controllers/public.controller");

// Browse approved restaurants
router.get("/restaurants", publicController.listRestaurants);

// View menu for a restaurant
router.get("/restaurants/:businessId/menu", publicController.getRestaurantMenu);

module.exports = router;