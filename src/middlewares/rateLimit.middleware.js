/**
 * Small in-memory rate limiters (no extra dependency).
 *
 *  - attemptLimiter: counts FAILED attempts (a 4xx response) per key and blocks
 *    the key once it reaches `max` inside `windowMs`. A success (2xx) clears the
 *    counter, so real users are never locked out by their own good logins.
 *  - requestLimiter: plain "N requests per window" cap, for endpoints where every
 *    call costs something (forgot password, resend code).
 *
 * State lives in this process. With several server instances each one keeps its
 * own counters; move to a shared store (e.g. Redis) if you scale out.
 */

const stores = [];

function makeStore() {
  const map = new Map(); // key -> { count, resetAt }
  stores.push(map);
  return map;
}

// Drop expired entries once a minute so the maps cannot grow forever.
const sweep = setInterval(() => {
  const now = Date.now();
  for (const map of stores) {
    for (const [k, v] of map) if (v.resetAt <= now) map.delete(k);
  }
}, 60 * 1000);
sweep.unref();

const clientIp = (req) => req.ip || req.socket?.remoteAddress || "unknown";
const norm = (v) => String(v ?? "").trim().toLowerCase().slice(0, 120);

function tooMany(res, resetAt, message) {
  const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  const minutes = Math.ceil(retryAfter / 60);
  res.set("Retry-After", String(retryAfter));
  return res.status(429).json({
    success: false,
    message: `${message} Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    retryAfter,
  });
}

/**
 * @param {object} o
 * @param {number} o.windowMs   how long failures are remembered / how long a block lasts
 * @param {number} o.max        failed attempts allowed per key inside the window
 * @param {(req)=>string[]} o.keys  one or more keys to track (e.g. ip+email, and ip)
 * @param {string} o.message
 */
function attemptLimiter({ windowMs, max, keys, message }) {
  const store = makeStore();

  return (req, res, next) => {
    const now = Date.now();
    const ks = keys(req).filter(Boolean);

    for (const k of ks) {
      const e = store.get(k);
      if (e && e.resetAt > now && e.count >= max) return tooMany(res, e.resetAt, message);
    }

    res.on("finish", () => {
      const failed = res.statusCode >= 400 && res.statusCode < 500;
      const ok = res.statusCode >= 200 && res.statusCode < 300;
      for (const k of ks) {
        if (ok) {
          store.delete(k);
        } else if (failed) {
          const cur = store.get(k);
          if (!cur || cur.resetAt <= Date.now()) store.set(k, { count: 1, resetAt: Date.now() + windowMs });
          else cur.count += 1;
        }
      }
    });

    next();
  };
}

function requestLimiter({ windowMs, max, keys, message }) {
  const store = makeStore();

  return (req, res, next) => {
    const now = Date.now();
    for (const k of keys(req).filter(Boolean)) {
      const e = store.get(k);
      if (!e || e.resetAt <= now) {
        store.set(k, { count: 1, resetAt: now + windowMs });
      } else if (e.count >= max) {
        return tooMany(res, e.resetAt, message);
      } else {
        e.count += 1;
      }
    }
    next();
  };
}

const MIN = 60 * 1000;

// Login (all roles): 5 wrong passwords per account+IP per 15 min, plus a wider per-IP net
// against one address trying many accounts (30 failures, so shared networks are not locked out).
function loginLimiters(field) {
  const perAccount = attemptLimiter({
    windowMs: 15 * MIN,
    max: 5,
    message: "Too many failed login attempts.",
    keys: (req) => [`login:acct:${norm(req.body?.[field])}:${clientIp(req)}`],
  });
  const perIp = attemptLimiter({
    windowMs: 15 * MIN,
    max: 30,
    message: "Too many failed login attempts from this network.",
    keys: (req) => [`login:ip:${clientIp(req)}`],
  });
  return [perIp, perAccount];
}

// OTP check: 5 wrong codes per user per 10 min, 20 per IP.
const verifyLimiters = () => [
  attemptLimiter({
    windowMs: 10 * MIN,
    max: 20,
    message: "Too many verification attempts from this network.",
    keys: (req) => [`otp:ip:${clientIp(req)}`],
  }),
  attemptLimiter({
    windowMs: 10 * MIN,
    max: 5,
    message: "Too many incorrect codes.",
    keys: (req) => [`otp:user:${norm(req.body?.userId)}`],
  }),
];

// Cost-per-call endpoints.
const forgotPasswordLimiter = requestLimiter({
  windowMs: 15 * MIN,
  max: 5,
  message: "Too many password reset requests.",
  keys: (req) => [`forgot:ip:${clientIp(req)}`, `forgot:email:${norm(req.body?.email)}`],
});

const resetPasswordLimiter = attemptLimiter({
  windowMs: 15 * MIN,
  max: 10,
  message: "Too many invalid reset attempts.",
  keys: (req) => [`reset:ip:${clientIp(req)}`],
});

const resendOtpLimiter = requestLimiter({
  windowMs: 10 * MIN,
  max: 5,
  message: "Too many code requests.",
  keys: (req) => [`resend:ip:${clientIp(req)}`, `resend:user:${norm(req.body?.userId)}`],
});

module.exports = {
  attemptLimiter,
  requestLimiter,
  loginLimiters,
  verifyLimiters,
  forgotPasswordLimiter,
  resetPasswordLimiter,
  resendOtpLimiter,
};
