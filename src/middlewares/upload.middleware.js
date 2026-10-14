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

// ── Profile pictures: images only, smaller limit, their own Cloudinary folder ──
const avatarStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "oya_eat_avatars",
    resource_type: "image",
    public_id: (req, file) => `user-${req.user?.id || "x"}-${Date.now()}`,
  },
});

const avatarUpload = multer({
  storage: avatarStorage,
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(jpeg|png|webp)$/.test(file.mimetype) && /\.(jpe?g|png|webp)$/i.test(file.originalname);
    if (ok) return cb(null, true);
    const err = new Error("Please choose a JPG, PNG or WebP image.");
    err.status = 400;
    cb(err);
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// Say clearly when image hosting is not configured, instead of an opaque 500 from Cloudinary.
const cloudinaryConfigured = () =>
  !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

const avatarSingle = (field) => (req, res, next) => {
  if (!cloudinaryConfigured()) {
    return res.status(503).json({
      success: false,
      message: "Image uploads are not set up on the server yet (Cloudinary keys are missing).",
    });
  }
  return avatarUpload.single(field)(req, res, next);
};

module.exports = upload;
module.exports.avatar = { single: avatarSingle };
