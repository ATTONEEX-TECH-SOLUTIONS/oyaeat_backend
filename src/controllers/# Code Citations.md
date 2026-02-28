# Code Citations

## License: unknown
https://github.com/yonatan2703/Pet-Adoption-Be/blob/0c5b89ee99d5d8dca94e15ad7e2bd1192855b5b9/lib/uploadFiles.js

```
I'll help you create a complete vendor registration flow with phone verification, business details, document verification, and review status. Here's the implementation:

````javascript
// filepath: c:\Users\USER\workspace\oyaeat-backend\src\controllers\vendor.controller.js
// ...existing code...

// Step 1: Initial vendor registration with personal details
exports.registerVendor = async (req, res) => {
  try {
    const { firstName, lastName, businessType, email, phoneNumber } = req.body;

    // Validate inputs
    if (!firstName || !lastName || !businessType || !email || !phoneNumber) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Check if email already exists
    const existingVendor = await prisma.vendor.findUnique({
      where: { email },
    });

    if (existingVendor) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // Create vendor with PENDING_PHONE_VERIFICATION status
    const vendor = await prisma.vendor.create({
      data: {
        firstName,
        lastName,
        businessType,
        email,
        phoneNumber,
        status: "PENDING_PHONE_VERIFICATION",
      },
    });

    // TODO: Send OTP to phone number
    res.status(201).json({
      message: "Vendor registered. Please verify your phone number.",
      vendorId: vendor.id,
    });
  } catch (error) {
    res.status(500).json({ message: "Registration failed", error: error.message });
  }
};

// Step 2: Verify phone number with OTP
exports.verifyPhoneNumber = async (req, res) => {
  try {
    const { vendorId, otp } = req.body;

    if (!vendorId || !otp) {
      return res.status(400).json({ message: "Vendor ID and OTP are required" });
    }

    // TODO: Validate OTP from your SMS service
    const isValidOtp = true; // Replace with actual OTP validation

    if (!isValidOtp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // Update vendor status to PENDING_BUSINESS_DETAILS
    const vendor = await prisma.vendor.update({
      where: { id: vendorId },
      data: { status: "PENDING_BUSINESS_DETAILS" },
    });

    res.json({
      message: "Phone number verified successfully",
      vendorId: vendor.id,
      nextStep: "Upload business details",
    });
  } catch (error) {
    res.status(500).json({ message: "Verification failed", error: error.message });
  }
};

// Step 3: Upload business details
exports.uploadBusinessDetails = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const {
      businessName,
      businessType,
      streetAddress,
      city,
      state,
      zipCode,
      businessPhoneNumber,
      businessEmail,
      websiteUrl,
      businessDescription,
    } = req.body;

    // Validate inputs
    if (
      !businessName ||
      !businessType ||
      !streetAddress ||
      !city ||
      !state ||
      !zipCode ||
      !businessPhoneNumber ||
      !businessEmail ||
      !businessDescription
    ) {
      return res.status(400).json({ message: "All required fields must be provided" });
    }

    // Update vendor with business details
    const vendor = await prisma.vendor.update({
      where: { id: vendorId },
      data: {
        businessName,
        businessType,
        streetAddress,
        city,
        state,
        zipCode,
        businessPhoneNumber,
        businessEmail,
        websiteUrl: websiteUrl || null,
        businessDescription,
        status: "PENDING_DOCUMENT_VERIFICATION",
      },
    });

    res.json({
      message: "Business details uploaded successfully",
      vendorId: vendor.id,
      nextStep: "Upload verification documents",
    });
  } catch (error) {
    res.status(500).json({ message: "Upload failed", error: error.message });
  }
};

// Step 4: Upload verification documents
exports.uploadVerificationDocuments = async (req, res) => {
  try {
    const { vendorId } = req.params;

    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    const requiredDocs = [
      "businessLicense",
      "taxId",
      "businessAccountDetails",
      "foodSafetyCertificate",
      "ownerId",
    ];

    // Check if all required documents are provided
    for (const doc of requiredDocs) {
      if (!req.files[doc]) {
        return res
          .status(400)
          .json({ message: `Missing required document: ${doc}` });
      }
    }

    // Save file paths (adjust based on your upload middleware)
    const documentPaths = {
      businessLicensePath: req.files.businessLicense[0].path,
      taxIdPath: req.files.taxId[0].path,
      businessAccountDetailsPath: req.files.businessAccountDetails[0].path,
      foodSafetyCertificatePath: req.files.foodSafetyCertificate[0].path,
      ownerIdPath: req.files.ownerId[0].path,
    };

    // Update vendor with document paths
    const vendor = await prisma.vendor.update({
      where: { id: vendorId },
      data: {
        ...documentPaths,
        status: "PENDING_REVIEW",
      },
    });

    res.json({
      message: "Documents uploaded successfully. Waiting for admin review.",
      vendorId: vendor.id,
      status: "PENDING_REVIEW",
    });
  } catch (error) {
    res.status(500).json({ message: "Document upload failed", error: error.message });
  }
};

// ...existing code...
````

````javascript
// filepath: c:\Users\USER\workspace\oyaeat-backend\src\routes\vendor.routes.js
const express = require("express");
const router = express.Router();
const vendorController = require("../controllers/vendor.controller");
const authMiddleware = require("../middlewares/auth.middleware");
const uploadMiddleware = require("../middlewares/upload.middleware");

// Step 1: Register vendor with personal details
router.post("/register", vendorController.registerVendor);

// Step 2: Verify phone number
router.post("/verify-phone", vendorController.verifyPhoneNumber);

// Step 3: Upload business details
router.put("/:vendorId/business-details", vendorController.uploadBusinessDetails);

// Step 4: Upload verification documents
router.post(
  "/:vendorId/upload-documents",
  uploadMiddleware.multiple([
    { name: "businessLicense", maxCount: 1 },
    { name: "taxId", maxCount: 1 },
    { name: "businessAccountDetails", maxCount: 1 },
    { name: "foodSafetyCertificate", maxCount: 1 },
    { name: "ownerId", maxCount: 1 },
  ]),
  vendorController.uploadVerificationDocuments
);

module.exports = router;
````

````javascript
// filepath: c:\Users\USER\workspace\oyaeat-backend\src\middlewares\upload.middleware.js
const multer = require("multer");
const path = require("path");

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

exports.single = (fiel
```


## License: unknown
https://github.com/yonatan2703/Pet-Adoption-Be/blob/0c5b89ee99d5d8dca94e15ad7e2bd1192855b5b9/lib/uploadFiles.js

```
I'll help you create a complete vendor registration flow with phone verification, business details, document verification, and review status. Here's the implementation:

````javascript
// filepath: c:\Users\USER\workspace\oyaeat-backend\src\controllers\vendor.controller.js
// ...existing code...

// Step 1: Initial vendor registration with personal details
exports.registerVendor = async (req, res) => {
  try {
    const { firstName, lastName, businessType, email, phoneNumber } = req.body;

    // Validate inputs
    if (!firstName || !lastName || !businessType || !email || !phoneNumber) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Check if email already exists
    const existingVendor = await prisma.vendor.findUnique({
      where: { email },
    });

    if (existingVendor) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // Create vendor with PENDING_PHONE_VERIFICATION status
    const vendor = await prisma.vendor.create({
      data: {
        firstName,
        lastName,
        businessType,
        email,
        phoneNumber,
        status: "PENDING_PHONE_VERIFICATION",
      },
    });

    // TODO: Send OTP to phone number
    res.status(201).json({
      message: "Vendor registered. Please verify your phone number.",
      vendorId: vendor.id,
    });
  } catch (error) {
    res.status(500).json({ message: "Registration failed", error: error.message });
  }
};

// Step 2: Verify phone number with OTP
exports.verifyPhoneNumber = async (req, res) => {
  try {
    const { vendorId, otp } = req.body;

    if (!vendorId || !otp) {
      return res.status(400).json({ message: "Vendor ID and OTP are required" });
    }

    // TODO: Validate OTP from your SMS service
    const isValidOtp = true; // Replace with actual OTP validation

    if (!isValidOtp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // Update vendor status to PENDING_BUSINESS_DETAILS
    const vendor = await prisma.vendor.update({
      where: { id: vendorId },
      data: { status: "PENDING_BUSINESS_DETAILS" },
    });

    res.json({
      message: "Phone number verified successfully",
      vendorId: vendor.id,
      nextStep: "Upload business details",
    });
  } catch (error) {
    res.status(500).json({ message: "Verification failed", error: error.message });
  }
};

// Step 3: Upload business details
exports.uploadBusinessDetails = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const {
      businessName,
      businessType,
      streetAddress,
      city,
      state,
      zipCode,
      businessPhoneNumber,
      businessEmail,
      websiteUrl,
      businessDescription,
    } = req.body;

    // Validate inputs
    if (
      !businessName ||
      !businessType ||
      !streetAddress ||
      !city ||
      !state ||
      !zipCode ||
      !businessPhoneNumber ||
      !businessEmail ||
      !businessDescription
    ) {
      return res.status(400).json({ message: "All required fields must be provided" });
    }

    // Update vendor with business details
    const vendor = await prisma.vendor.update({
      where: { id: vendorId },
      data: {
        businessName,
        businessType,
        streetAddress,
        city,
        state,
        zipCode,
        businessPhoneNumber,
        businessEmail,
        websiteUrl: websiteUrl || null,
        businessDescription,
        status: "PENDING_DOCUMENT_VERIFICATION",
      },
    });

    res.json({
      message: "Business details uploaded successfully",
      vendorId: vendor.id,
      nextStep: "Upload verification documents",
    });
  } catch (error) {
    res.status(500).json({ message: "Upload failed", error: error.message });
  }
};

// Step 4: Upload verification documents
exports.uploadVerificationDocuments = async (req, res) => {
  try {
    const { vendorId } = req.params;

    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    const requiredDocs = [
      "businessLicense",
      "taxId",
      "businessAccountDetails",
      "foodSafetyCertificate",
      "ownerId",
    ];

    // Check if all required documents are provided
    for (const doc of requiredDocs) {
      if (!req.files[doc]) {
        return res
          .status(400)
          .json({ message: `Missing required document: ${doc}` });
      }
    }

    // Save file paths (adjust based on your upload middleware)
    const documentPaths = {
      businessLicensePath: req.files.businessLicense[0].path,
      taxIdPath: req.files.taxId[0].path,
      businessAccountDetailsPath: req.files.businessAccountDetails[0].path,
      foodSafetyCertificatePath: req.files.foodSafetyCertificate[0].path,
      ownerIdPath: req.files.ownerId[0].path,
    };

    // Update vendor with document paths
    const vendor = await prisma.vendor.update({
      where: { id: vendorId },
      data: {
        ...documentPaths,
        status: "PENDING_REVIEW",
      },
    });

    res.json({
      message: "Documents uploaded successfully. Waiting for admin review.",
      vendorId: vendor.id,
      status: "PENDING_REVIEW",
    });
  } catch (error) {
    res.status(500).json({ message: "Document upload failed", error: error.message });
  }
};

// ...existing code...
````

````javascript
// filepath: c:\Users\USER\workspace\oyaeat-backend\src\routes\vendor.routes.js
const express = require("express");
const router = express.Router();
const vendorController = require("../controllers/vendor.controller");
const authMiddleware = require("../middlewares/auth.middleware");
const uploadMiddleware = require("../middlewares/upload.middleware");

// Step 1: Register vendor with personal details
router.post("/register", vendorController.registerVendor);

// Step 2: Verify phone number
router.post("/verify-phone", vendorController.verifyPhoneNumber);

// Step 3: Upload business details
router.put("/:vendorId/business-details", vendorController.uploadBusinessDetails);

// Step 4: Upload verification documents
router.post(
  "/:vendorId/upload-documents",
  uploadMiddleware.multiple([
    { name: "businessLicense", maxCount: 1 },
    { name: "taxId", maxCount: 1 },
    { name: "businessAccountDetails", maxCount: 1 },
    { name: "foodSafetyCertificate", maxCount: 1 },
    { name: "ownerId", maxCount: 1 },
  ]),
  vendorController.uploadVerificationDocuments
);

module.exports = router;
````

````javascript
// filepath: c:\Users\USER\workspace\oyaeat-backend\src\middlewares\upload.middleware.js
const multer = require("multer");
const path = require("path");

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

exports.single = (fiel
```


## License: unknown
https://github.com/yonatan2703/Pet-Adoption-Be/blob/0c5b89ee99d5d8dca94e15ad7e2bd1192855b5b9/lib/uploadFiles.js

```
I'll help you create a complete vendor registration flow with phone verification, business details, document verification, and review status. Here's the implementation:

````javascript
// filepath: c:\Users\USER\workspace\oyaeat-backend\src\controllers\vendor.controller.js
// ...existing code...

// Step 1: Initial vendor registration with personal details
exports.registerVendor = async (req, res) => {
  try {
    const { firstName, lastName, businessType, email, phoneNumber } = req.body;

    // Validate inputs
    if (!firstName || !lastName || !businessType || !email || !phoneNumber) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Check if email already exists
    const existingVendor = await prisma.vendor.findUnique({
      where: { email },
    });

    if (existingVendor) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // Create vendor with PENDING_PHONE_VERIFICATION status
    const vendor = await prisma.vendor.create({
      data: {
        firstName,
        lastName,
        businessType,
        email,
        phoneNumber,
        status: "PENDING_PHONE_VERIFICATION",
      },
    });

    // TODO: Send OTP to phone number
    res.status(201).json({
      message: "Vendor registered. Please verify your phone number.",
      vendorId: vendor.id,
    });
  } catch (error) {
    res.status(500).json({ message: "Registration failed", error: error.message });
  }
};

// Step 2: Verify phone number with OTP
exports.verifyPhoneNumber = async (req, res) => {
  try {
    const { vendorId, otp } = req.body;

    if (!vendorId || !otp) {
      return res.status(400).json({ message: "Vendor ID and OTP are required" });
    }

    // TODO: Validate OTP from your SMS service
    const isValidOtp = true; // Replace with actual OTP validation

    if (!isValidOtp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // Update vendor status to PENDING_BUSINESS_DETAILS
    const vendor = await prisma.vendor.update({
      where: { id: vendorId },
      data: { status: "PENDING_BUSINESS_DETAILS" },
    });

    res.json({
      message: "Phone number verified successfully",
      vendorId: vendor.id,
      nextStep: "Upload business details",
    });
  } catch (error) {
    res.status(500).json({ message: "Verification failed", error: error.message });
  }
};

// Step 3: Upload business details
exports.uploadBusinessDetails = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const {
      businessName,
      businessType,
      streetAddress,
      city,
      state,
      zipCode,
      businessPhoneNumber,
      businessEmail,
      websiteUrl,
      businessDescription,
    } = req.body;

    // Validate inputs
    if (
      !businessName ||
      !businessType ||
      !streetAddress ||
      !city ||
      !state ||
      !zipCode ||
      !businessPhoneNumber ||
      !businessEmail ||
      !businessDescription
    ) {
      return res.status(400).json({ message: "All required fields must be provided" });
    }

    // Update vendor with business details
    const vendor = await prisma.vendor.update({
      where: { id: vendorId },
      data: {
        businessName,
        businessType,
        streetAddress,
        city,
        state,
        zipCode,
        businessPhoneNumber,
        businessEmail,
        websiteUrl: websiteUrl || null,
        businessDescription,
        status: "PENDING_DOCUMENT_VERIFICATION",
      },
    });

    res.json({
      message: "Business details uploaded successfully",
      vendorId: vendor.id,
      nextStep: "Upload verification documents",
    });
  } catch (error) {
    res.status(500).json({ message: "Upload failed", error: error.message });
  }
};

// Step 4: Upload verification documents
exports.uploadVerificationDocuments = async (req, res) => {
  try {
    const { vendorId } = req.params;

    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    const requiredDocs = [
      "businessLicense",
      "taxId",
      "businessAccountDetails",
      "foodSafetyCertificate",
      "ownerId",
    ];

    // Check if all required documents are provided
    for (const doc of requiredDocs) {
      if (!req.files[doc]) {
        return res
          .status(400)
          .json({ message: `Missing required document: ${doc}` });
      }
    }

    // Save file paths (adjust based on your upload middleware)
    const documentPaths = {
      businessLicensePath: req.files.businessLicense[0].path,
      taxIdPath: req.files.taxId[0].path,
      businessAccountDetailsPath: req.files.businessAccountDetails[0].path,
      foodSafetyCertificatePath: req.files.foodSafetyCertificate[0].path,
      ownerIdPath: req.files.ownerId[0].path,
    };

    // Update vendor with document paths
    const vendor = await prisma.vendor.update({
      where: { id: vendorId },
      data: {
        ...documentPaths,
        status: "PENDING_REVIEW",
      },
    });

    res.json({
      message: "Documents uploaded successfully. Waiting for admin review.",
      vendorId: vendor.id,
      status: "PENDING_REVIEW",
    });
  } catch (error) {
    res.status(500).json({ message: "Document upload failed", error: error.message });
  }
};

// ...existing code...
````

````javascript
// filepath: c:\Users\USER\workspace\oyaeat-backend\src\routes\vendor.routes.js
const express = require("express");
const router = express.Router();
const vendorController = require("../controllers/vendor.controller");
const authMiddleware = require("../middlewares/auth.middleware");
const uploadMiddleware = require("../middlewares/upload.middleware");

// Step 1: Register vendor with personal details
router.post("/register", vendorController.registerVendor);

// Step 2: Verify phone number
router.post("/verify-phone", vendorController.verifyPhoneNumber);

// Step 3: Upload business details
router.put("/:vendorId/business-details", vendorController.uploadBusinessDetails);

// Step 4: Upload verification documents
router.post(
  "/:vendorId/upload-documents",
  uploadMiddleware.multiple([
    { name: "businessLicense", maxCount: 1 },
    { name: "taxId", maxCount: 1 },
    { name: "businessAccountDetails", maxCount: 1 },
    { name: "foodSafetyCertificate", maxCount: 1 },
    { name: "ownerId", maxCount: 1 },
  ]),
  vendorController.uploadVerificationDocuments
);

module.exports = router;
````

````javascript
// filepath: c:\Users\USER\workspace\oyaeat-backend\src\middlewares\upload.middleware.js
const multer = require("multer");
const path = require("path");

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

exports.single = (fiel
```


## License: unknown
https://github.com/yonatan2703/Pet-Adoption-Be/blob/0c5b89ee99d5d8dca94e15ad7e2bd1192855b5b9/lib/uploadFiles.js

```
I'll help you create a complete vendor registration flow with phone verification, business details, document verification, and review status. Here's the implementation:

````javascript
// filepath: c:\Users\USER\workspace\oyaeat-backend\src\controllers\vendor.controller.js
// ...existing code...

// Step 1: Initial vendor registration with personal details
exports.registerVendor = async (req, res) => {
  try {
    const { firstName, lastName, businessType, email, phoneNumber } = req.body;

    // Validate inputs
    if (!firstName || !lastName || !businessType || !email || !phoneNumber) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Check if email already exists
    const existingVendor = await prisma.vendor.findUnique({
      where: { email },
    });

    if (existingVendor) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // Create vendor with PENDING_PHONE_VERIFICATION status
    const vendor = await prisma.vendor.create({
      data: {
        firstName,
        lastName,
        businessType,
        email,
        phoneNumber,
        status: "PENDING_PHONE_VERIFICATION",
      },
    });

    // TODO: Send OTP to phone number
    res.status(201).json({
      message: "Vendor registered. Please verify your phone number.",
      vendorId: vendor.id,
    });
  } catch (error) {
    res.status(500).json({ message: "Registration failed", error: error.message });
  }
};

// Step 2: Verify phone number with OTP
exports.verifyPhoneNumber = async (req, res) => {
  try {
    const { vendorId, otp } = req.body;

    if (!vendorId || !otp) {
      return res.status(400).json({ message: "Vendor ID and OTP are required" });
    }

    // TODO: Validate OTP from your SMS service
    const isValidOtp = true; // Replace with actual OTP validation

    if (!isValidOtp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // Update vendor status to PENDING_BUSINESS_DETAILS
    const vendor = await prisma.vendor.update({
      where: { id: vendorId },
      data: { status: "PENDING_BUSINESS_DETAILS" },
    });

    res.json({
      message: "Phone number verified successfully",
      vendorId: vendor.id,
      nextStep: "Upload business details",
    });
  } catch (error) {
    res.status(500).json({ message: "Verification failed", error: error.message });
  }
};

// Step 3: Upload business details
exports.uploadBusinessDetails = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const {
      businessName,
      businessType,
      streetAddress,
      city,
      state,
      zipCode,
      businessPhoneNumber,
      businessEmail,
      websiteUrl,
      businessDescription,
    } = req.body;

    // Validate inputs
    if (
      !businessName ||
      !businessType ||
      !streetAddress ||
      !city ||
      !state ||
      !zipCode ||
      !businessPhoneNumber ||
      !businessEmail ||
      !businessDescription
    ) {
      return res.status(400).json({ message: "All required fields must be provided" });
    }

    // Update vendor with business details
    const vendor = await prisma.vendor.update({
      where: { id: vendorId },
      data: {
        businessName,
        businessType,
        streetAddress,
        city,
        state,
        zipCode,
        businessPhoneNumber,
        businessEmail,
        websiteUrl: websiteUrl || null,
        businessDescription,
        status: "PENDING_DOCUMENT_VERIFICATION",
      },
    });

    res.json({
      message: "Business details uploaded successfully",
      vendorId: vendor.id,
      nextStep: "Upload verification documents",
    });
  } catch (error) {
    res.status(500).json({ message: "Upload failed", error: error.message });
  }
};

// Step 4: Upload verification documents
exports.uploadVerificationDocuments = async (req, res) => {
  try {
    const { vendorId } = req.params;

    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    const requiredDocs = [
      "businessLicense",
      "taxId",
      "businessAccountDetails",
      "foodSafetyCertificate",
      "ownerId",
    ];

    // Check if all required documents are provided
    for (const doc of requiredDocs) {
      if (!req.files[doc]) {
        return res
          .status(400)
          .json({ message: `Missing required document: ${doc}` });
      }
    }

    // Save file paths (adjust based on your upload middleware)
    const documentPaths = {
      businessLicensePath: req.files.businessLicense[0].path,
      taxIdPath: req.files.taxId[0].path,
      businessAccountDetailsPath: req.files.businessAccountDetails[0].path,
      foodSafetyCertificatePath: req.files.foodSafetyCertificate[0].path,
      ownerIdPath: req.files.ownerId[0].path,
    };

    // Update vendor with document paths
    const vendor = await prisma.vendor.update({
      where: { id: vendorId },
      data: {
        ...documentPaths,
        status: "PENDING_REVIEW",
      },
    });

    res.json({
      message: "Documents uploaded successfully. Waiting for admin review.",
      vendorId: vendor.id,
      status: "PENDING_REVIEW",
    });
  } catch (error) {
    res.status(500).json({ message: "Document upload failed", error: error.message });
  }
};

// ...existing code...
````

````javascript
// filepath: c:\Users\USER\workspace\oyaeat-backend\src\routes\vendor.routes.js
const express = require("express");
const router = express.Router();
const vendorController = require("../controllers/vendor.controller");
const authMiddleware = require("../middlewares/auth.middleware");
const uploadMiddleware = require("../middlewares/upload.middleware");

// Step 1: Register vendor with personal details
router.post("/register", vendorController.registerVendor);

// Step 2: Verify phone number
router.post("/verify-phone", vendorController.verifyPhoneNumber);

// Step 3: Upload business details
router.put("/:vendorId/business-details", vendorController.uploadBusinessDetails);

// Step 4: Upload verification documents
router.post(
  "/:vendorId/upload-documents",
  uploadMiddleware.multiple([
    { name: "businessLicense", maxCount: 1 },
    { name: "taxId", maxCount: 1 },
    { name: "businessAccountDetails", maxCount: 1 },
    { name: "foodSafetyCertificate", maxCount: 1 },
    { name: "ownerId", maxCount: 1 },
  ]),
  vendorController.uploadVerificationDocuments
);

module.exports = router;
````

````javascript
// filepath: c:\Users\USER\workspace\oyaeat-backend\src\middlewares\upload.middleware.js
const multer = require("multer");
const path = require("path");

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

exports.single = (fiel
```


## License: unknown
https://github.com/yonatan2703/Pet-Adoption-Be/blob/0c5b89ee99d5d8dca94e15ad7e2bd1192855b5b9/lib/uploadFiles.js

```
I'll help you create a complete vendor registration flow with phone verification, business details, document verification, and review status. Here's the implementation:

````javascript
// filepath: c:\Users\USER\workspace\oyaeat-backend\src\controllers\vendor.controller.js
// ...existing code...

// Step 1: Initial vendor registration with personal details
exports.registerVendor = async (req, res) => {
  try {
    const { firstName, lastName, businessType, email, phoneNumber } = req.body;

    // Validate inputs
    if (!firstName || !lastName || !businessType || !email || !phoneNumber) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Check if email already exists
    const existingVendor = await prisma.vendor.findUnique({
      where: { email },
    });

    if (existingVendor) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // Create vendor with PENDING_PHONE_VERIFICATION status
    const vendor = await prisma.vendor.create({
      data: {
        firstName,
        lastName,
        businessType,
        email,
        phoneNumber,
        status: "PENDING_PHONE_VERIFICATION",
      },
    });

    // TODO: Send OTP to phone number
    res.status(201).json({
      message: "Vendor registered. Please verify your phone number.",
      vendorId: vendor.id,
    });
  } catch (error) {
    res.status(500).json({ message: "Registration failed", error: error.message });
  }
};

// Step 2: Verify phone number with OTP
exports.verifyPhoneNumber = async (req, res) => {
  try {
    const { vendorId, otp } = req.body;

    if (!vendorId || !otp) {
      return res.status(400).json({ message: "Vendor ID and OTP are required" });
    }

    // TODO: Validate OTP from your SMS service
    const isValidOtp = true; // Replace with actual OTP validation

    if (!isValidOtp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // Update vendor status to PENDING_BUSINESS_DETAILS
    const vendor = await prisma.vendor.update({
      where: { id: vendorId },
      data: { status: "PENDING_BUSINESS_DETAILS" },
    });

    res.json({
      message: "Phone number verified successfully",
      vendorId: vendor.id,
      nextStep: "Upload business details",
    });
  } catch (error) {
    res.status(500).json({ message: "Verification failed", error: error.message });
  }
};

// Step 3: Upload business details
exports.uploadBusinessDetails = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const {
      businessName,
      businessType,
      streetAddress,
      city,
      state,
      zipCode,
      businessPhoneNumber,
      businessEmail,
      websiteUrl,
      businessDescription,
    } = req.body;

    // Validate inputs
    if (
      !businessName ||
      !businessType ||
      !streetAddress ||
      !city ||
      !state ||
      !zipCode ||
      !businessPhoneNumber ||
      !businessEmail ||
      !businessDescription
    ) {
      return res.status(400).json({ message: "All required fields must be provided" });
    }

    // Update vendor with business details
    const vendor = await prisma.vendor.update({
      where: { id: vendorId },
      data: {
        businessName,
        businessType,
        streetAddress,
        city,
        state,
        zipCode,
        businessPhoneNumber,
        businessEmail,
        websiteUrl: websiteUrl || null,
        businessDescription,
        status: "PENDING_DOCUMENT_VERIFICATION",
      },
    });

    res.json({
      message: "Business details uploaded successfully",
      vendorId: vendor.id,
      nextStep: "Upload verification documents",
    });
  } catch (error) {
    res.status(500).json({ message: "Upload failed", error: error.message });
  }
};

// Step 4: Upload verification documents
exports.uploadVerificationDocuments = async (req, res) => {
  try {
    const { vendorId } = req.params;

    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    const requiredDocs = [
      "businessLicense",
      "taxId",
      "businessAccountDetails",
      "foodSafetyCertificate",
      "ownerId",
    ];

    // Check if all required documents are provided
    for (const doc of requiredDocs) {
      if (!req.files[doc]) {
        return res
          .status(400)
          .json({ message: `Missing required document: ${doc}` });
      }
    }

    // Save file paths (adjust based on your upload middleware)
    const documentPaths = {
      businessLicensePath: req.files.businessLicense[0].path,
      taxIdPath: req.files.taxId[0].path,
      businessAccountDetailsPath: req.files.businessAccountDetails[0].path,
      foodSafetyCertificatePath: req.files.foodSafetyCertificate[0].path,
      ownerIdPath: req.files.ownerId[0].path,
    };

    // Update vendor with document paths
    const vendor = await prisma.vendor.update({
      where: { id: vendorId },
      data: {
        ...documentPaths,
        status: "PENDING_REVIEW",
      },
    });

    res.json({
      message: "Documents uploaded successfully. Waiting for admin review.",
      vendorId: vendor.id,
      status: "PENDING_REVIEW",
    });
  } catch (error) {
    res.status(500).json({ message: "Document upload failed", error: error.message });
  }
};

// ...existing code...
````

````javascript
// filepath: c:\Users\USER\workspace\oyaeat-backend\src\routes\vendor.routes.js
const express = require("express");
const router = express.Router();
const vendorController = require("../controllers/vendor.controller");
const authMiddleware = require("../middlewares/auth.middleware");
const uploadMiddleware = require("../middlewares/upload.middleware");

// Step 1: Register vendor with personal details
router.post("/register", vendorController.registerVendor);

// Step 2: Verify phone number
router.post("/verify-phone", vendorController.verifyPhoneNumber);

// Step 3: Upload business details
router.put("/:vendorId/business-details", vendorController.uploadBusinessDetails);

// Step 4: Upload verification documents
router.post(
  "/:vendorId/upload-documents",
  uploadMiddleware.multiple([
    { name: "businessLicense", maxCount: 1 },
    { name: "taxId", maxCount: 1 },
    { name: "businessAccountDetails", maxCount: 1 },
    { name: "foodSafetyCertificate", maxCount: 1 },
    { name: "ownerId", maxCount: 1 },
  ]),
  vendorController.uploadVerificationDocuments
);

module.exports = router;
````

````javascript
// filepath: c:\Users\USER\workspace\oyaeat-backend\src\middlewares\upload.middleware.js
const multer = require("multer");
const path = require("path");

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

exports.single = (fiel
```


## License: unknown
https://github.com/yonatan2703/Pet-Adoption-Be/blob/0c5b89ee99d5d8dca94e15ad7e2bd1192855b5b9/lib/uploadFiles.js

```
I'll help you create a complete vendor registration flow with phone verification, business details, document verification, and review status. Here's the implementation:

````javascript
// filepath: c:\Users\USER\workspace\oyaeat-backend\src\controllers\vendor.controller.js
// ...existing code...

// Step 1: Initial vendor registration with personal details
exports.registerVendor = async (req, res) => {
  try {
    const { firstName, lastName, businessType, email, phoneNumber } = req.body;

    // Validate inputs
    if (!firstName || !lastName || !businessType || !email || !phoneNumber) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Check if email already exists
    const existingVendor = await prisma.vendor.findUnique({
      where: { email },
    });

    if (existingVendor) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // Create vendor with PENDING_PHONE_VERIFICATION status
    const vendor = await prisma.vendor.create({
      data: {
        firstName,
        lastName,
        businessType,
        email,
        phoneNumber,
        status: "PENDING_PHONE_VERIFICATION",
      },
    });

    // TODO: Send OTP to phone number
    res.status(201).json({
      message: "Vendor registered. Please verify your phone number.",
      vendorId: vendor.id,
    });
  } catch (error) {
    res.status(500).json({ message: "Registration failed", error: error.message });
  }
};

// Step 2: Verify phone number with OTP
exports.verifyPhoneNumber = async (req, res) => {
  try {
    const { vendorId, otp } = req.body;

    if (!vendorId || !otp) {
      return res.status(400).json({ message: "Vendor ID and OTP are required" });
    }

    // TODO: Validate OTP from your SMS service
    const isValidOtp = true; // Replace with actual OTP validation

    if (!isValidOtp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // Update vendor status to PENDING_BUSINESS_DETAILS
    const vendor = await prisma.vendor.update({
      where: { id: vendorId },
      data: { status: "PENDING_BUSINESS_DETAILS" },
    });

    res.json({
      message: "Phone number verified successfully",
      vendorId: vendor.id,
      nextStep: "Upload business details",
    });
  } catch (error) {
    res.status(500).json({ message: "Verification failed", error: error.message });
  }
};

// Step 3: Upload business details
exports.uploadBusinessDetails = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const {
      businessName,
      businessType,
      streetAddress,
      city,
      state,
      zipCode,
      businessPhoneNumber,
      businessEmail,
      websiteUrl,
      businessDescription,
    } = req.body;

    // Validate inputs
    if (
      !businessName ||
      !businessType ||
      !streetAddress ||
      !city ||
      !state ||
      !zipCode ||
      !businessPhoneNumber ||
      !businessEmail ||
      !businessDescription
    ) {
      return res.status(400).json({ message: "All required fields must be provided" });
    }

    // Update vendor with business details
    const vendor = await prisma.vendor.update({
      where: { id: vendorId },
      data: {
        businessName,
        businessType,
        streetAddress,
        city,
        state,
        zipCode,
        businessPhoneNumber,
        businessEmail,
        websiteUrl: websiteUrl || null,
        businessDescription,
        status: "PENDING_DOCUMENT_VERIFICATION",
      },
    });

    res.json({
      message: "Business details uploaded successfully",
      vendorId: vendor.id,
      nextStep: "Upload verification documents",
    });
  } catch (error) {
    res.status(500).json({ message: "Upload failed", error: error.message });
  }
};

// Step 4: Upload verification documents
exports.uploadVerificationDocuments = async (req, res) => {
  try {
    const { vendorId } = req.params;

    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    const requiredDocs = [
      "businessLicense",
      "taxId",
      "businessAccountDetails",
      "foodSafetyCertificate",
      "ownerId",
    ];

    // Check if all required documents are provided
    for (const doc of requiredDocs) {
      if (!req.files[doc]) {
        return res
          .status(400)
          .json({ message: `Missing required document: ${doc}` });
      }
    }

    // Save file paths (adjust based on your upload middleware)
    const documentPaths = {
      businessLicensePath: req.files.businessLicense[0].path,
      taxIdPath: req.files.taxId[0].path,
      businessAccountDetailsPath: req.files.businessAccountDetails[0].path,
      foodSafetyCertificatePath: req.files.foodSafetyCertificate[0].path,
      ownerIdPath: req.files.ownerId[0].path,
    };

    // Update vendor with document paths
    const vendor = await prisma.vendor.update({
      where: { id: vendorId },
      data: {
        ...documentPaths,
        status: "PENDING_REVIEW",
      },
    });

    res.json({
      message: "Documents uploaded successfully. Waiting for admin review.",
      vendorId: vendor.id,
      status: "PENDING_REVIEW",
    });
  } catch (error) {
    res.status(500).json({ message: "Document upload failed", error: error.message });
  }
};

// ...existing code...
````

````javascript
// filepath: c:\Users\USER\workspace\oyaeat-backend\src\routes\vendor.routes.js
const express = require("express");
const router = express.Router();
const vendorController = require("../controllers/vendor.controller");
const authMiddleware = require("../middlewares/auth.middleware");
const uploadMiddleware = require("../middlewares/upload.middleware");

// Step 1: Register vendor with personal details
router.post("/register", vendorController.registerVendor);

// Step 2: Verify phone number
router.post("/verify-phone", vendorController.verifyPhoneNumber);

// Step 3: Upload business details
router.put("/:vendorId/business-details", vendorController.uploadBusinessDetails);

// Step 4: Upload verification documents
router.post(
  "/:vendorId/upload-documents",
  uploadMiddleware.multiple([
    { name: "businessLicense", maxCount: 1 },
    { name: "taxId", maxCount: 1 },
    { name: "businessAccountDetails", maxCount: 1 },
    { name: "foodSafetyCertificate", maxCount: 1 },
    { name: "ownerId", maxCount: 1 },
  ]),
  vendorController.uploadVerificationDocuments
);

module.exports = router;
````

````javascript
// filepath: c:\Users\USER\workspace\oyaeat-backend\src\middlewares\upload.middleware.js
const multer = require("multer");
const path = require("path");

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

exports.single = (fiel
```


## License: unknown
https://github.com/yonatan2703/Pet-Adoption-Be/blob/0c5b89ee99d5d8dca94e15ad7e2bd1192855b5b9/lib/uploadFiles.js

```
I'll help you create a complete vendor registration flow with phone verification, business details, document verification, and review status. Here's the implementation:

````javascript
// filepath: c:\Users\USER\workspace\oyaeat-backend\src\controllers\vendor.controller.js
// ...existing code...

// Step 1: Initial vendor registration with personal details
exports.registerVendor = async (req, res) => {
  try {
    const { firstName, lastName, businessType, email, phoneNumber } = req.body;

    // Validate inputs
    if (!firstName || !lastName || !businessType || !email || !phoneNumber) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Check if email already exists
    const existingVendor = await prisma.vendor.findUnique({
      where: { email },
    });

    if (existingVendor) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // Create vendor with PENDING_PHONE_VERIFICATION status
    const vendor = await prisma.vendor.create({
      data: {
        firstName,
        lastName,
        businessType,
        email,
        phoneNumber,
        status: "PENDING_PHONE_VERIFICATION",
      },
    });

    // TODO: Send OTP to phone number
    res.status(201).json({
      message: "Vendor registered. Please verify your phone number.",
      vendorId: vendor.id,
    });
  } catch (error) {
    res.status(500).json({ message: "Registration failed", error: error.message });
  }
};

// Step 2: Verify phone number with OTP
exports.verifyPhoneNumber = async (req, res) => {
  try {
    const { vendorId, otp } = req.body;

    if (!vendorId || !otp) {
      return res.status(400).json({ message: "Vendor ID and OTP are required" });
    }

    // TODO: Validate OTP from your SMS service
    const isValidOtp = true; // Replace with actual OTP validation

    if (!isValidOtp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // Update vendor status to PENDING_BUSINESS_DETAILS
    const vendor = await prisma.vendor.update({
      where: { id: vendorId },
      data: { status: "PENDING_BUSINESS_DETAILS" },
    });

    res.json({
      message: "Phone number verified successfully",
      vendorId: vendor.id,
      nextStep: "Upload business details",
    });
  } catch (error) {
    res.status(500).json({ message: "Verification failed", error: error.message });
  }
};

// Step 3: Upload business details
exports.uploadBusinessDetails = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const {
      businessName,
      businessType,
      streetAddress,
      city,
      state,
      zipCode,
      businessPhoneNumber,
      businessEmail,
      websiteUrl,
      businessDescription,
    } = req.body;

    // Validate inputs
    if (
      !businessName ||
      !businessType ||
      !streetAddress ||
      !city ||
      !state ||
      !zipCode ||
      !businessPhoneNumber ||
      !businessEmail ||
      !businessDescription
    ) {
      return res.status(400).json({ message: "All required fields must be provided" });
    }

    // Update vendor with business details
    const vendor = await prisma.vendor.update({
      where: { id: vendorId },
      data: {
        businessName,
        businessType,
        streetAddress,
        city,
        state,
        zipCode,
        businessPhoneNumber,
        businessEmail,
        websiteUrl: websiteUrl || null,
        businessDescription,
        status: "PENDING_DOCUMENT_VERIFICATION",
      },
    });

    res.json({
      message: "Business details uploaded successfully",
      vendorId: vendor.id,
      nextStep: "Upload verification documents",
    });
  } catch (error) {
    res.status(500).json({ message: "Upload failed", error: error.message });
  }
};

// Step 4: Upload verification documents
exports.uploadVerificationDocuments = async (req, res) => {
  try {
    const { vendorId } = req.params;

    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    const requiredDocs = [
      "businessLicense",
      "taxId",
      "businessAccountDetails",
      "foodSafetyCertificate",
      "ownerId",
    ];

    // Check if all required documents are provided
    for (const doc of requiredDocs) {
      if (!req.files[doc]) {
        return res
          .status(400)
          .json({ message: `Missing required document: ${doc}` });
      }
    }

    // Save file paths (adjust based on your upload middleware)
    const documentPaths = {
      businessLicensePath: req.files.businessLicense[0].path,
      taxIdPath: req.files.taxId[0].path,
      businessAccountDetailsPath: req.files.businessAccountDetails[0].path,
      foodSafetyCertificatePath: req.files.foodSafetyCertificate[0].path,
      ownerIdPath: req.files.ownerId[0].path,
    };

    // Update vendor with document paths
    const vendor = await prisma.vendor.update({
      where: { id: vendorId },
      data: {
        ...documentPaths,
        status: "PENDING_REVIEW",
      },
    });

    res.json({
      message: "Documents uploaded successfully. Waiting for admin review.",
      vendorId: vendor.id,
      status: "PENDING_REVIEW",
    });
  } catch (error) {
    res.status(500).json({ message: "Document upload failed", error: error.message });
  }
};

// ...existing code...
````

````javascript
// filepath: c:\Users\USER\workspace\oyaeat-backend\src\routes\vendor.routes.js
const express = require("express");
const router = express.Router();
const vendorController = require("../controllers/vendor.controller");
const authMiddleware = require("../middlewares/auth.middleware");
const uploadMiddleware = require("../middlewares/upload.middleware");

// Step 1: Register vendor with personal details
router.post("/register", vendorController.registerVendor);

// Step 2: Verify phone number
router.post("/verify-phone", vendorController.verifyPhoneNumber);

// Step 3: Upload business details
router.put("/:vendorId/business-details", vendorController.uploadBusinessDetails);

// Step 4: Upload verification documents
router.post(
  "/:vendorId/upload-documents",
  uploadMiddleware.multiple([
    { name: "businessLicense", maxCount: 1 },
    { name: "taxId", maxCount: 1 },
    { name: "businessAccountDetails", maxCount: 1 },
    { name: "foodSafetyCertificate", maxCount: 1 },
    { name: "ownerId", maxCount: 1 },
  ]),
  vendorController.uploadVerificationDocuments
);

module.exports = router;
````

````javascript
// filepath: c:\Users\USER\workspace\oyaeat-backend\src\middlewares\upload.middleware.js
const multer = require("multer");
const path = require("path");

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

exports.single = (fiel
```

