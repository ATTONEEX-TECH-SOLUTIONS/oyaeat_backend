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

const PROFILE_SELECT = { id: true, firstName: true, lastName: true, email: true, phone: true, role: true };

// GET /customer/auth/me
exports.getProfile = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: PROFILE_SELECT });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, data: { user } });
  } catch (e) {
    res.status(500).json({ success: false, message: "Failed to load profile", error: e.message });
  }
};

// PATCH /customer/auth/me  { firstName?, lastName?, phone?, currentPassword?+newPassword? }
exports.updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, phone, currentPassword, newPassword } = req.body;
    const data = {};
    if (firstName !== undefined) data.firstName = String(firstName).trim();
    if (lastName !== undefined) data.lastName = String(lastName).trim();
    if (data.firstName === "" || data.lastName === "") {
      return res.status(400).json({ success: false, message: "Names cannot be empty" });
    }

    if (phone !== undefined) {
      const taken = await prisma.user.findFirst({ where: { phone, NOT: { id: req.user.id } }, select: { id: true } });
      if (taken) return res.status(409).json({ success: false, message: "Phone number already in use" });
      data.phone = phone;
    }

    if (newPassword !== undefined) {
      if (String(newPassword).length < 6) {
        return res.status(400).json({ success: false, message: "New password must be at least 6 characters" });
      }
      const current = await prisma.user.findUnique({ where: { id: req.user.id }, select: { password: true } });
      if (!currentPassword || !(await bcrypt.compare(currentPassword, current.password))) {
        return res.status(401).json({ success: false, message: "Current password is incorrect" });
      }
      data.password = await bcrypt.hash(newPassword, 10);
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ success: false, message: "Nothing to update" });
    }

    const user = await prisma.user.update({ where: { id: req.user.id }, data, select: PROFILE_SELECT });
    res.json({ success: true, message: "Profile updated", data: { user } });
  } catch (e) {
    res.status(500).json({ success: false, message: "Failed to update profile", error: e.message });
  }
};
