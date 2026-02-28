const prisma = require("../lib/prisma");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// Step 1: Initial vendor registration with personal details
exports.registerVendor = async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password, businessType } = req.body;

    // Validate inputs
    if (!firstName || !lastName || !email || !phone || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // Check if phone already exists
    const existingPhone = await prisma.user.findUnique({
      where: { phone },
    });

    if (existingPhone) {
      return res.status(400).json({ message: "Phone number already registered" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user with owner role
    const user = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        phone,
        password: hashedPassword,
        role: "owner",
        phoneVerified: false,
      },
    });

    // Generate hardcoded OTP for phone verification (HARDCODED: 123456)
    const phoneVerification = await prisma.phoneVerification.create({
      data: {
        userId: user.id,
        code: "123456", // HARDCODED OTP
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
        verified: false,
      },
    });

    res.status(201).json({
      message: "User registered successfully. Please verify your phone number.",
      userId: user.id,
      otp: "123456", // For testing purposes only
      nextStep: "Verify phone number with OTP",
    });
  } catch (error) {
    res.status(500).json({ message: "Registration failed", error: error.message });
  }
};

// Step 2: Verify phone number with hardcoded OTP
exports.verifyPhoneNumber = async (req, res) => {
  try {
    const { userId, otp } = req.body;

    if (!userId || !otp) {
      return res.status(400).json({ message: "User ID and OTP are required" });
    }

    // Find phone verification record
    const phoneVerification = await prisma.phoneVerification.findFirst({
      where: {
        userId: parseInt(userId),
        verified: false,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!phoneVerification) {
      return res.status(400).json({ message: "No active verification found" });
    }

    // Check if OTP is expired
    if (new Date() > phoneVerification.expiresAt) {
      return res.status(400).json({ message: "OTP has expired" });
    }

    // Verify OTP (hardcoded: 123456)
    if (otp !== "123456") {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // Mark phone verification as verified
    await prisma.phoneVerification.update({
      where: { id: phoneVerification.id },
      data: { verified: true },
    });

    // Update user phone verified status
    const user = await prisma.user.update({
      where: { id: parseInt(userId) },
      data: { phoneVerified: true },
    });

    res.json({
      message: "Phone number verified successfully",
      userId: user.id,
      nextStep: "Upload business details",
    });
  } catch (error) {
    res.status(500).json({ message: "Verification failed", error: error.message });
  }
};

// Login: email + password, returns JWT and vendor dashboard summary
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        businesses: {
          include: {
            documents: true,
            bankDetail: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    const dashboard = {
      userId: user.id,
      role: user.role,
      phoneVerified: user.phoneVerified,
      businesses: user.businesses.map(b => ({
        id: b.id,
        name: b.name,
        status: b.status,
        rejectionReason: b.rejectionReason || null,
        hasDocuments: (b.documents || []).length > 0,
        hasBankDetail: !!b.bankDetail,
      })),
    };

    res.json({
      message: "Login successful",
      token,
      dashboard,
      nextStep: !user.phoneVerified
        ? "Verify phone"
        : user.businesses.length === 0
        ? "Upload business details"
        : "Check business status",
    });
  } catch (error) {
    res.status(500).json({ message: "Login failed", error: error.message });
  }
};
