const prisma = require("../lib/prisma");
const split = require("../services/paystackSplit");

const handle = (res, e, fallback) => {
  if (e instanceof split.PaystackError) {
    return res.status(e.status === 502 ? 502 : 400).json({ success: false, message: e.message });
  }
  console.error(fallback, e);
  return res.status(500).json({ success: false, message: fallback });
};

const publicView = (bank) =>
  bank && {
    bankName: bank.bankName,
    bankCode: bank.bankCode,
    accountName: bank.accountName,
    accountNumber: bank.accountNumber,
    commissionPercent: bank.commissionPercent,
    subaccountCode: bank.paystackSubaccountCode,
    active: bank.subaccountActive,
  };

// GET /admin/banks
exports.listBanks = async (req, res) => {
  try {
    const banks = await split.listBanks();
    res.json({ success: true, data: banks.map((b) => ({ name: b.name, code: b.code })) });
  } catch (e) {
    handle(res, e, "Failed to load banks");
  }
};

// POST /admin/payment-accounts/resolve  { accountNumber, bankCode }
exports.resolveAccount = async (req, res) => {
  const { accountNumber, bankCode } = req.body;
  if (!/^\d{10}$/.test(String(accountNumber || "")) || !bankCode) {
    return res.status(400).json({ success: false, message: "A bank and a 10-digit account number are required" });
  }
  try {
    const r = await split.resolveAccount(accountNumber, bankCode);
    res.json({ success: true, data: { accountName: r.account_name, accountNumber: r.account_number } });
  } catch (e) {
    handle(res, e, "Failed to verify account");
  }
};

// GET /admin/businesses/:businessId/payment-account
exports.getPaymentAccount = async (req, res) => {
  const businessId = parseInt(req.params.businessId, 10);
  const bank = await prisma.businessBankDetail.findUnique({ where: { businessId } });
  res.json({ success: true, data: publicView(bank) || null });
};

// PUT /admin/businesses/:businessId/payment-account
// { bankCode, bankName, accountNumber, accountName?, commissionPercent? }
exports.setPaymentAccount = async (req, res) => {
  const businessId = parseInt(req.params.businessId, 10);
  const { bankCode, bankName, accountNumber } = req.body;
  const commissionPercent =
    req.body.commissionPercent === "" || req.body.commissionPercent == null ? null : Number(req.body.commissionPercent);

  if (!bankCode || !bankName || !/^\d{10}$/.test(String(accountNumber || ""))) {
    return res.status(400).json({ success: false, message: "bankCode, bankName and a 10-digit accountNumber are required" });
  }
  if (commissionPercent != null && !(commissionPercent >= 0 && commissionPercent < 100)) {
    return res.status(400).json({ success: false, message: "commissionPercent must be between 0 and 99.99" });
  }

  try {
    const business = await prisma.business.findUnique({ where: { id: businessId }, include: { owner: true, bankDetail: true } });
    if (!business) return res.status(404).json({ success: false, message: "Restaurant not found" });
    if (business.status !== "approved") {
      return res.status(409).json({ success: false, message: "Approve the restaurant before setting up its payment account" });
    }

    // The account name always comes from the bank, never from the form.
    const resolved = await split.resolveAccount(accountNumber, bankCode);
    const percentage = await split.platformCommissionPercent({ commissionPercent });

    const sub = await split.upsertSubaccount({
      existingCode: business.bankDetail?.paystackSubaccountCode,
      businessName: business.name,
      bankCode,
      accountNumber,
      percentageCharge: percentage,
      contact: {
        email: business.businessEmail || business.owner?.email,
        name: `${business.owner?.firstName || ""} ${business.owner?.lastName || ""}`.trim() || undefined,
        phone: business.businessPhone,
      },
    });

    const data = {
      bankName,
      bankCode,
      accountNumber,
      accountName: resolved.account_name,
      commissionPercent,
      paystackSubaccountCode: sub.subaccount_code,
      subaccountActive: true,
    };
    const bank = await prisma.businessBankDetail.upsert({
      where: { businessId },
      update: data,
      create: { businessId, ...data },
    });
    await prisma.business.update({ where: { id: businessId }, data: { hasBankDetails: true } }).catch(() => {});
    res.json({ success: true, data: publicView(bank) });
  } catch (e) {
    handle(res, e, "Failed to set up the payment account");
  }
};

// DELETE /admin/businesses/:businessId/payment-account  — stops online payments (account kept for history)
exports.deactivatePaymentAccount = async (req, res) => {
  const businessId = parseInt(req.params.businessId, 10);
  try {
    const bank = await prisma.businessBankDetail.findUnique({ where: { businessId } });
    if (!bank?.paystackSubaccountCode) return res.status(404).json({ success: false, message: "No payment account to deactivate" });
    await split.deactivateSubaccount(bank.paystackSubaccountCode);
    const updated = await prisma.businessBankDetail.update({ where: { businessId }, data: { subaccountActive: false } });
    res.json({ success: true, data: publicView(updated) });
  } catch (e) {
    handle(res, e, "Failed to deactivate the payment account");
  }
};
