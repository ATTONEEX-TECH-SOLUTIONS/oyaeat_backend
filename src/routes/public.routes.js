const express = require("express");
const router = express.Router();

const publicController = require("../controllers/public.controller");
const promoController = require("../controllers/promo.controller");

// Browse approved restaurants
router.get("/restaurants", publicController.listRestaurants);

// View menu for a restaurant
router.get("/restaurants/:businessId/menu", publicController.getRestaurantMenu);

router.get("/promos", promoController.getActivePromos);
router.get("/promos", promoController.getPublicPromoFeed);

module.exports = router;



