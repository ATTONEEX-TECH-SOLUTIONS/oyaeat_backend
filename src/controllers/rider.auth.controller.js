const prisma = require("../lib/prisma");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

exports.registerRider = async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password, vehicleType, plateNumber } = req.body;
    
    if (!firstName || !lastName || !email || !phone || !password || !vehicleType) {
      return res.status(400).json({ message: "All required fields must be provided" });
    }
    
    // idDocument from multer
    if (!req.file) {
      return res.status(400).json({ message: "ID document is required" });
    }

    const idDocumentUrl = `/uploads/${req.file.filename}`;

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { phone }
        ]
      }
    });

    if (existingUser) {
      return res.status(400).json({ message: "Email or phone already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        phone,
        password: hashedPassword,
        role: "rider",
        phoneVerified: false,
        riderProfile: {
          create: {
            vehicleType,
            plateNumber: plateNumber || null,
            idDocumentUrl,
          }
        }
      },
      include: {
        riderProfile: true
      }
    });

    res.status(201).json({
      message: "Rider registered successfully",
      userId: user.id,
      role: user.role
    });
  } catch (error) {
    res.status(500).json({ message: "Registration failed", error: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        riderProfile: true
      }
    });

    if (!user || user.role !== "rider") {
      return res.status(401).json({ message: "Invalid credentials or not a rider" });
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
      riderProfile: user.riderProfile
    };

    res.json({
      message: "Login successful",
      token,
      dashboard
    });
  } catch (error) {
    res.status(500).json({ message: "Login failed", error: error.message });
  }
};

