const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const requireRole = require("../middlewares/role.middleware");
const c = require("../controllers/customer.account.controller");

router.use(authMiddleware);
router.use(requireRole("customer"));

router.get("/addresses", c.listAddresses);
router.post("/addresses", c.createAddress);
router.patch("/addresses/:id", c.updateAddress);
router.delete("/addresses/:id", c.deleteAddress);

router.get("/favorites", c.listFavorites);
router.put("/favorites/:businessId", c.addFavorite);
router.delete("/favorites/:businessId", c.removeFavorite);

module.exports = router;
