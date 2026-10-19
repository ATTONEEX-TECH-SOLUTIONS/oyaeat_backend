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

// GET /admin/payment-accounts — approved restaurants with their payment-account status
exports.listPaymentAccounts = async (req, res) => {
  try {
    const businesses = await prisma.business.findMany({
      where: { status: "approved" },
      select: { id: true, name: true, city: true, businessEmail: true, bankDetail: true },
      orderBy: { name: "asc" },
    });
    res.json({
      success: true,
      data: businesses.map((b) => ({
        businessId: b.id,
        name: b.name,
        city: b.city,
        email: b.businessEmail,
        account: publicView(b.bankDetail && b.bankDetail.paystackSubaccountCode ? b.bankDetail : null),
        // What the restaurant submitted at signup, for the admin to compare against.
        submittedBank: b.bankDetail && !b.bankDetail.paystackSubaccountCode
          ? { bankName: b.bankDetail.bankName, accountNumber: b.bankDetail.accountNumber, accountName: b.bankDetail.accountName }
          : null,
      })),
    });
  } catch (e) {
    handle(res, e, "Failed to load payment accounts");
  }
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

// ─── Riders: Paystack transfer recipients ─────────────────────

// GET /admin/rider-payout-accounts
exports.listRiderAccounts = async (req, res) => {
  try {
    const riders = await prisma.riderProfile.findMany({
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({
      success: true,
      data: riders.map((r) => ({
        userId: r.userId,
        name: `${r.user.firstName} ${r.user.lastName}`.trim(),
        email: r.user.email,
        account: r.paystackRecipientCode
          ? { bankName: r.bankName, bankCode: r.bankCode, accountName: r.accountName, accountNumber: r.accountNumber, active: true }
          : null,
        submittedBank: !r.paystackRecipientCode && r.bankName
          ? { bankName: r.bankName, accountNumber: r.accountNumber, accountName: r.accountName }
          : null,
      })),
    });
  } catch (e) {
    handle(res, e, "Failed to load riders");
  }
};

// PUT /admin/riders/:userId/payout-account  { bankCode, bankName, accountNumber }
exports.setRiderAccount = async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  const { bankCode, bankName, accountNumber } = req.body;
  if (!bankCode || !bankName || !/^\d{10}$/.test(String(accountNumber || ""))) {
    return res.status(400).json({ success: false, message: "bankCode, bankName and a 10-digit accountNumber are required" });
  }
  try {
    const profile = await prisma.riderProfile.findUnique({ where: { userId } });
    if (!profile) return res.status(404).json({ success: false, message: "Rider not found" });

    const resolved = await split.resolveAccount(accountNumber, bankCode);
    const recipient = await split.createTransferRecipient({ name: resolved.account_name, accountNumber, bankCode });
    const updated = await prisma.riderProfile.update({
      where: { userId },
      data: {
        bankName,
        bankCode,
        accountNumber,
        accountName: resolved.account_name,
        paystackRecipientCode: recipient.recipient_code,
      },
    });
    res.json({
      success: true,
      data: { bankName: updated.bankName, bankCode, accountName: updated.accountName, accountNumber, active: true },
    });
  } catch (e) {
    handle(res, e, "Failed to set up the rider's payout account");
  }
};

// ─── Cash orders: commission restaurants owe ──────────────────

// GET /admin/cash-commissions
exports.listCashCommissions = async (req, res) => {
  try {
    const wallets = await prisma.wallet.findMany({
      where: { balance: { lt: 0 }, user: { role: "owner" } },
      include: { user: { include: { businesses: { select: { id: true, name: true } } } } },
    });
    res.json({
      success: true,
      data: wallets.map((w) => ({
        userId: w.userId,
        businessId: w.user.businesses[0]?.id || null,
        name: w.user.businesses[0]?.name || `${w.user.firstName} ${w.user.lastName}`,
        owed: Math.round(-w.balance * 100) / 100,
      })),
    });
  } catch (e) {
    handle(res, e, "Failed to load cash commissions");
  }
};

// POST /admin/cash-commissions/:userId/settle  { amount }  — record cash commission received from a restaurant
exports.settleCashCommission = async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  const amount = Number(req.body.amount);
  if (!(amount > 0)) return res.status(400).json({ success: false, message: "Enter the amount received" });
  try {
    const result = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet || wallet.balance >= 0) return { error: "This restaurant owes nothing" };
      if (amount > -wallet.balance + 0.005) return { error: "That is more than the restaurant owes" };
      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: amount } } });
      await tx.walletTransaction.create({
        data: { walletId: wallet.id, amount, type: "credit", status: "completed", description: "Cash commission payment received" },
      });
      return { owed: Math.round((-wallet.balance - amount) * 100) / 100 };
    });
    if (result.error) return res.status(409).json({ success: false, message: result.error });
    res.json({ success: true, data: result });
  } catch (e) {
    handle(res, e, "Failed to record the payment");
  }
};
