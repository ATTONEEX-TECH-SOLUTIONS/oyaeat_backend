const crypto = require("crypto");
const bcrypt = require("bcrypt");
const prisma = require("../lib/prisma");
const { sendPasswordResetEmail } = require("../services/emailService");

const TOKEN_TTL_MS = 30 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const hashToken = (t) => crypto.createHash("sha256").update(t).digest("hex");

// POST /auth/forgot-password  { email }
// Works for every role (customer, vendor, rider, admin share the User table).
// Always answers the same way so it cannot be used to discover registered emails.
exports.forgotPassword = async (req, res) => {
  const generic = { success: true, message: "If that email is registered, a reset link has been sent." };
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ success: false, message: "email is required" });
    }

    const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
    if (!user) return res.json(generic);

    const recent = await prisma.passwordResetToken.findFirst({
      where: { userId: user.id, createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_MS) } },
    });
    if (recent) return res.json(generic);

    const token = crypto.randomBytes(32).toString("hex");
    await prisma.$transaction([
      prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
      prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + TOKEN_TTL_MS) },
      }),
    ]);

    const base = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");
    const resetUrl = `${base}/reset-password?token=${token}&role=${user.role}`;
    const sent = await sendPasswordResetEmail(user.email, user.firstName, resetUrl);
    if (!sent && process.env.NODE_ENV !== "production") {
      console.log(`[dev] password reset link for ${user.email}: ${resetUrl}`);
    }

    res.json(generic);
  } catch (e) {
    res.status(500).json({ success: false, message: "Could not process request", error: e.message });
  }
};

// POST /auth/reset-password  { token, password }
exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ success: false, message: "token and password are required" });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    }

    const hashed = await bcrypt.hash(password, 10);
    const tokenHash = hashToken(String(token));

    const ok = await prisma.$transaction(async (tx) => {
      // Single-use: only one request can flip usedAt from null.
      const claimed = await tx.passwordResetToken.updateMany({
        where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (claimed.count === 0) return false;
      const row = await tx.passwordResetToken.findUnique({ where: { tokenHash } });
      await tx.user.update({ where: { id: row.userId }, data: { password: hashed } });
      await tx.passwordResetToken.deleteMany({ where: { userId: row.userId, usedAt: null } });
      return true;
    });

    if (!ok) {
      return res.status(400).json({ success: false, message: "This reset link is invalid or has expired." });
    }
    res.json({ success: true, message: "Password updated. You can now sign in." });
  } catch (e) {
    res.status(500).json({ success: false, message: "Could not reset password", error: e.message });
  }
};
