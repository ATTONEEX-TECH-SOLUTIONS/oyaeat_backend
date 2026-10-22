const prisma = require("../lib/prisma");

// Settings (all editable by an admin) and their defaults.
const DEFAULTS = {
  "fees.deliveryBase": 500, // naira charged before any distance
  "fees.deliveryPerKm": 150, // naira per km of road distance
  "fees.deliveryMin": 800,
  "fees.deliveryMax": 5000,
  "fees.baseDeliveryFee": 1500, // flat fee when the distance can't be worked out
  "fees.riderSharePercent": 80, // the rider's cut of the delivery fee
};
// Straight-line distance undercounts the road, so scale it up.
const ROAD_FACTOR = 1.3;
const ROUND_TO = 50;

const validCoord = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

function haversineKm(lat1, lng1, lat2, lng2) {
  const rad = (d) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

async function loadSettings() {
  const rows = await prisma.systemSetting.findMany({ where: { key: { in: Object.keys(DEFAULTS) } } });
  const out = { ...DEFAULTS };
  for (const r of rows) {
    const n = parseFloat(r.value);
    if (Number.isFinite(n)) out[r.key] = n;
  }
  return out;
}

/**
 * Works out what the customer pays for delivery and what the rider earns from it.
 * Distance is straight-line from the restaurant to the customer, scaled for roads.
 * Without usable coordinates for both ends, a flat fee is charged instead.
 * Returns { deliveryFee, riderPayout, distanceKm } in naira / km.
 */
async function quoteDelivery({ businessId, customerLatitude, customerLongitude }) {
  const [s, business] = await Promise.all([
    loadSettings(),
    prisma.business.findUnique({ where: { id: businessId }, select: { latitude: true, longitude: true } }),
  ]);

  const custLat = customerLatitude == null ? NaN : Number(customerLatitude);
  const custLng = customerLongitude == null ? NaN : Number(customerLongitude);
  let distanceKm = null;
  let fee = s["fees.baseDeliveryFee"];

  if (business && validCoord(business.latitude, business.longitude) && validCoord(custLat, custLng)) {
    distanceKm = Math.round(haversineKm(business.latitude, business.longitude, custLat, custLng) * ROAD_FACTOR * 10) / 10;
    fee = s["fees.deliveryBase"] + s["fees.deliveryPerKm"] * distanceKm;
    fee = Math.min(Math.max(fee, s["fees.deliveryMin"]), s["fees.deliveryMax"]);
  }

  const deliveryFee = Math.round(fee / ROUND_TO) * ROUND_TO;
  const share = Math.min(Math.max(s["fees.riderSharePercent"], 0), 100);
  const riderPayout = Math.round((deliveryFee * share) / 100);
  return { deliveryFee, riderPayout, distanceKm };
}

module.exports = { quoteDelivery, DEFAULTS };
