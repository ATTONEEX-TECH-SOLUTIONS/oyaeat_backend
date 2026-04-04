const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const adminMiddleware = require('../middlewares/admin.middleware');
const broadcastController = require('../controllers/broadcast.controller');

// All admin routes require authentication and admin role
router.use(authMiddleware);
router.use(adminMiddleware);

// Get business statistics
router.get('/businesses/stats', adminController.getBusinessStats);

// Get all pending businesses
router.get('/businesses/pending', adminController.getPendingBusinesses);

// Status-specific lists
router.get('/businesses/approved', adminController.getApprovedBusinesses);
router.get('/businesses/rejected', adminController.getRejectedBusinesses);
router.get('/businesses/suspended', adminController.getSuspendedBusinesses);

// Get all businesses (with filters)
router.get('/businesses', adminController.getAllBusinesses);

// Get business by ID
router.get('/businesses/:businessId', adminController.getBusinessById);

// Approve business
router.post('/businesses/:businessId/approve', adminController.approveBusiness);

// Reject business
router.post('/businesses/:businessId/reject', adminController.rejectBusiness);

// Suspend business
router.post('/businesses/:businessId/suspend', adminController.suspendBusiness);

// Get all global orders
// Get all global orders
router.get('/orders', adminController.getGlobalOrders);

// Send Broadcast
router.post('/broadcast', broadcastController.sendBroadcast);

module.exports = router;
