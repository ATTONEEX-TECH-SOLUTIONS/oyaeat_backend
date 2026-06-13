const prisma = require("../lib/prisma");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

exports.login = async (req, res) => {
  try {
    console.log("LOGIN REQUEST BODY:", req.body);

    let { email, password } = req.body;

    // normalize input (IMPORTANT)
    email = email?.trim().toLowerCase();

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    console.log(" USER FOUND:", user?.email);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    if (user.role !== "admin") {
      console.log(" ROLE ERROR:", user.role);
      return res.status(403).json({
        success: false,
        message: "Access denied: not admin",
      });
    }

    const match = await bcrypt.compare(password, user.password);

    console.log(" PASSWORD MATCH:", match);

    if (!match) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        email: user.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    console.log(" LOGIN SUCCESS");

    return res.json({
      success: true,
      message: "Admin login successful",
      token,
      admin: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });

  } catch (error) {
    console.error(" LOGIN ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Admin login failed",
      error: error.message,
    });
  }
};