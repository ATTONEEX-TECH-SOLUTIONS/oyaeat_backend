const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');

const app = express();

// Behind a reverse proxy (Render, Heroku, nginx...) set TRUST_PROXY=1 so req.ip is the real
// client address; without it every visitor looks like the proxy and shares one rate-limit key.
if (process.env.TRUST_PROXY) {
  const n = Number(process.env.TRUST_PROXY);
  app.set('trust proxy', Number.isNaN(n) ? process.env.TRUST_PROXY : n);
}

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static('uploads'));

const swaggerDocument = YAML.load(path.resolve(__dirname, '../docs/openapi.yaml'));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
console.log('Swagger docs configured at /api-docs');

console.log("Cloudinary env loaded:", {
  name: !!process.env.CLOUDINARY_CLOUD_NAME,
  key: !!process.env.CLOUDINARY_API_KEY,
  secret: !!process.env.CLOUDINARY_API_SECRET,
});

// Existing routes
const authRoutes = require("./routes/auth.routes");
const vendorRoutes = require("./routes/vendor.routes");
const adminRoutes = require("./routes/admin.routes");
const adminAuthRoutes = require("./routes/admin.auth.routes");

//  NEW routes
const publicRoutes = require("./routes/public.routes");
const ordersRoutes = require("./routes/orders.routes");
const customerAuthRoutes = require("./routes/customer.auth.routes");
const adminDashboardRoutes = require("./routes/admin.dashboard.routes");
const riderAuthRoutes = require("./routes/rider.auth.routes");
const riderRoutes = require("./routes/rider.routes");
const adminRiderRouter = require("./routes/adminRider.routes");
const chatRoutes = require("./routes/chat.routes");
const walletRoutes = require("./routes/wallet.routes");
const customerAccountRoutes = require("./routes/customer.account.routes");
const complianceRoutes = require('./routes/compliance.routes');





// Mount routes
app.use("/auth", authRoutes);
app.use("/vendor", vendorRoutes);
app.use("/admin/auth", adminAuthRoutes);
app.use("/admin", adminRoutes);

//  NEW mounts
app.use("/public", publicRoutes);

app.use("/chat", chatRoutes);
app.use("/api/chat", chatRoutes); // alias: the frontend also calls /api/chat/*

app.use("/orders", ordersRoutes);
app.use("/customer/auth", customerAuthRoutes);
app.use("/customer", customerAccountRoutes);
app.use("/admin/dashboard", adminDashboardRoutes);
app.use("/auth/rider", riderAuthRoutes);
app.use("/rider", riderRoutes);
app.use("/api/rider/admin", adminRiderRouter);
app.use("/api/wallet", walletRoutes);
app.use('/compliance', complianceRoutes);


app.get('/docs-test', (req, res) => {
  res.json({ ok: true });
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      message: 'File too large. Maximum size is 5MB'
    });
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      success: false,
      message: 'Too many files uploaded'
    });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

module.exports = app;

