const prisma = require("../lib/prisma");

/**
 * 📢 FETCH ALL SYSTEM SETTINGS
 * GET /api/admin/settings
 */
exports.getSystemSettings = async (req, res) => {
  try {
    const userRole = req.user.role ? req.user.role.toLowerCase() : "";

    // Security check: Only official platform admins can access this profile
    if (userRole !== "admin") {
      return res.status(403).json({ success: false, message: "Access Denied: Admin authorization required." });
    }

    const dbSettings = await prisma.systemSetting.findMany();

    // Map rows into a clean, unified object key-value pair dictionary for the UI
    const settingsMap = {};
    dbSettings.forEach(item => {
      settingsMap[item.key] = item.value;
    });

    // Provide default fallback values if the database table is completely empty
    const responsePayload = {
      "core.platformName": settingsMap["core.platformName"] || "OyaEat",
      "core.supportEmail": settingsMap["core.supportEmail"] || "support@oyaeat.com",
      "core.webAddress": settingsMap["core.webAddress"] || "https://oyaeat.com",
      "core.maintenanceMode": settingsMap["core.maintenanceMode"] === "true",
      "fees.platformCommission": parseFloat(settingsMap["fees.platformCommission"] || "15"),
      "fees.baseRiderFee": parseFloat(settingsMap["fees.baseRiderFee"] || "1200"),
      "fees.deliveryBase": parseFloat(settingsMap["fees.deliveryBase"] || "500"),
      "fees.deliveryPerKm": parseFloat(settingsMap["fees.deliveryPerKm"] || "150"),
      "fees.deliveryMin": parseFloat(settingsMap["fees.deliveryMin"] || "800"),
      "fees.deliveryMax": parseFloat(settingsMap["fees.deliveryMax"] || "5000"),
      "fees.baseDeliveryFee": parseFloat(settingsMap["fees.baseDeliveryFee"] || "1500"),
      "fees.riderSharePercent": parseFloat(settingsMap["fees.riderSharePercent"] || "80"),
      "payouts.restaurantThreshold": parseFloat(settingsMap["payouts.restaurantThreshold"] || "10000"),
      "payouts.riderThreshold": parseFloat(settingsMap["payouts.riderThreshold"] || "5000"),
      "payouts.schedule": settingsMap["payouts.schedule"] || "weekly",
      "notifications.emailEnabled": settingsMap["notifications.emailEnabled"] !== "false",
      "notifications.smsEnabled": settingsMap["notifications.smsEnabled"] === "true",
      "notifications.dailyReports": settingsMap["notifications.dailyReports"] !== "false",
    };

    return res.json({ success: true, data: responsePayload });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};


exports.updateSystemSettings = async (req, res) => {
  try {
    const userRole = req.user.role ? req.user.role.toLowerCase() : "";
    if (userRole !== "admin") {
      return res.status(403).json({ success: false, message: "Access Denied: Unauthorized action." });
    }

    const payload = req.body; // Expects key-value pair layout tracking parameters

    // Process parameters transactional loops sequentially to guarantee speed
    const updatePromises = Object.keys(payload).map(key => {
      let valueStr = String(payload[key]);
      
      // Determine target category group block grouping labels
      let category = "core";
      if (key.startsWith("fees.")) category = "fees";
      if (key.startsWith("payouts.")) category = "payouts";
      if (key.startsWith("notifications.")) category = "notifications";

      return prisma.systemSetting.upsert({
        where: { key },
        update: { value: valueStr, category },
        create: { key, value: valueStr, category }
      });
    });

    await prisma.$transaction(updatePromises);

    return res.json({ success: true, message: "Global configurations synchronized successfully." });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
