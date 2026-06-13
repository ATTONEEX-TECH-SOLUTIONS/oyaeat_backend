module.exports = function requireRole(...allowedRoles) {
  return (req, res, next) => {
    // 🌟 FIX: Force lowercase so "Admin" and "admin" match perfectly
    const role = req.user?.role ? req.user.role.toLowerCase() : "";
    const normalizedAllowed = allowedRoles.map(r => r.toLowerCase());

    if (!role || !normalizedAllowed.includes(role)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: insufficient permissions",
      });
    }
    next();
  };
};
