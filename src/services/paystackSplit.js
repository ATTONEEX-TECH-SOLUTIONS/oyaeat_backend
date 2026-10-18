const prisma = require("../lib/prisma");

const BASE = () => process.env.PAYSTACK_BASE_URL || "https://api.paystack.co";
const DEFAULT_COMMISSION_PERCENT = 15.0;

class PaystackError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "PaystackError";
    this.status = status;
  }
}

async function paystack(method, path, body) {
  let res;
  try {
    res = await fetch(`${BASE()}${path}`, {
      method,
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    throw new PaystackError("We couldn't reach Paystack just now. Please try again.", 502);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.status) {
    throw new PaystackError(json?.message || `Paystack request failed (${res.status})`, res.status === 404 ? 404 : 400);
  }
  return json.data;
}

const listBanks = () => paystack("GET", "/bank?country=nigeria&perPage=200&use_cursor=false");

/** Looks up the registered name on a bank account. */
const resolveAccount = (accountNumber, bankCode) =>
  paystack("GET", `/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`);

/**
 * Creates (or updates) the restaurant's subaccount. `percentage_charge` is only a
 * fallback; every transaction passes its own `transaction_charge` (see splitFor).
 */
async function upsertSubaccount({ existingCode, businessName, bankCode, accountNumber, percentageCharge, contact }) {
  const payload = {
    business_name: businessName,
    settlement_bank: bankCode,
    account_number: accountNumber,
    percentage_charge: percentageCharge,
    primary_contact_email: contact?.email || undefined,
    primary_contact_name: contact?.name || undefined,
    primary_contact_phone: contact?.phone || undefined,
  };
  return existingCode
    ? paystack("PUT", `/subaccount/${existingCode}`, payload)
    : paystack("POST", "/subaccount", payload);
}

const deactivateSubaccount = (code) => paystack("PUT", `/subaccount/${code}`, { active: false });

async function platformCommissionPercent(businessBank) {
  if (businessBank?.commissionPercent != null) return businessBank.commissionPercent;
  const row = await prisma.systemSetting.findUnique({ where: { key: "fees.platformCommission" } });
  const n = row ? parseFloat(row.value) : NaN;
  return Number.isFinite(n) ? n : DEFAULT_COMMISSION_PERCENT;
}

const splitRequired = () => String(process.env.PAYMENT_SPLIT_REQUIRED ?? "true").toLowerCase() !== "false";

/**
 * Works out how a payment of `total` (naira) is divided for a restaurant.
 * Returns null when the restaurant has no active subaccount.
 * The platform's fee goes in `transaction_charge` (kobo); Paystack sends the rest to
 * the restaurant's bank. The platform account bears Paystack's processing fee.
 */
async function splitFor(businessId, total) {
  const bank = await prisma.businessBankDetail.findUnique({ where: { businessId } });
  if (!bank?.subaccountActive || !bank.paystackSubaccountCode) return null;

  const percent = await platformCommissionPercent(bank);
  const totalKobo = Math.round(total * 100);
  const feeKobo = Math.min(totalKobo - 1, Math.max(0, Math.round((totalKobo * percent) / 100)));
  return {
    subaccount: bank.paystackSubaccountCode,
    transaction_charge: feeKobo,
    bearer: "account",
    platformFee: feeKobo / 100,
    restaurantShare: (totalKobo - feeKobo) / 100,
  };
}

module.exports = {
  PaystackError,
  listBanks,
  resolveAccount,
  upsertSubaccount,
  deactivateSubaccount,
  platformCommissionPercent,
  splitRequired,
  splitFor,
};
