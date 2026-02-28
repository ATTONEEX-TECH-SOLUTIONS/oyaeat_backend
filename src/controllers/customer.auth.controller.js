const prisma = require("../lib/prisma");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

// POST /customer/auth/register
exports.registerCustomer = async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password } = req.body;

    if (!firstName || !lastName || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: "firstName, lastName, email, phone, password are required",
      });
    }

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { phone }] },
      select: { id: true },
    });

    if (existing) {
      return res.status(409).json({ success: false, message: "Email or phone already in use" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        phone,
        password: hashedPassword,
        role: "customer",
        phoneVerified: true, // customers don't need OTP for now
      },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, role: true },
    });

    const token = signToken(user);

    res.status(201).json({
      success: true,
      message: "Customer registered successfully",
      data: { user, token },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: "Registration failed", error: e.message });
  }
};

// POST /customer/auth/login
exports.loginCustomer = async (req, res) => {
  try {
    const { emailOrPhone, password } = req.body;

    if (!emailOrPhone || !password) {
      return res.status(400).json({
        success: false,
        message: "emailOrPhone and password are required",
      });
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: emailOrPhone }, { phone: emailOrPhone }],
      },
    });

    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    if (user.role !== "customer") {
      return res.status(403).json({ success: false, message: "Not a customer account" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const token = signToken(user);

    const safeUser = {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      role: user.role,
    };

    res.json({
      success: true,
      message: "Login successful",
      data: { user: safeUser, token },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: "Login failed", error: e.message });
  }
};