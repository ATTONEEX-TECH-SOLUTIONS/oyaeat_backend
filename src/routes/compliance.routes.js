const express = require('express');
const router = express.Router();
const complianceController = require('../controllers/compliance.controller');

//  FIX 1: Import your upload middleware cleanly under the variable name 'upload'
const upload = require('../middlewares/upload.middleware'); 

// Import your authentication token middleware cleanly
const authMiddleware = require('../middlewares/auth.middleware'); 

router.post(
  '/appeal',
  authMiddleware, 
  //  FIX 2: Call '.single' on the matching 'upload' variable name we defined above
  upload.single('evidence'), 
  complianceController.submitOperationalAppeal
);

module.exports = router;
