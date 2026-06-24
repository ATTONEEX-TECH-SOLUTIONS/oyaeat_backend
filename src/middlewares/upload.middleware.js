const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../lib/cloudinary"); // 🚀 Make sure this points to your cloudinary config file
const path = require("path");

// Configure streaming storage properties directly into your Cloudinary instance
const cloudStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "oya_eat_compliance", 
    resource_type: "auto",        // 🚀 Allows BOTH pictures (.jpg, .png) and PDFs
    public_id: (req, file) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const cleanName = path.parse(file.originalname).name.replace(/\s+/g, "_");
      return `${file.fieldname}-${cleanName}-${uniqueSuffix}`;
    },
  },
});

const upload = multer({
  storage: cloudStorage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error("Security exception: Only verified PDF, JPG, JPEG, and PNG document formats are allowed."));
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB ceiling
});

module.exports = upload;
