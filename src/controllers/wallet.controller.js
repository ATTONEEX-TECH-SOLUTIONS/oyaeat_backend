const prisma = require("../lib/prisma");

// ── ENDPOINT A: VIEW WALLET & LEDGER DETAILS (For Riders & Vendors) ──
exports.getUserWalletSummary = async (req, res) => {
  try {
    const userId = req.user.id; 
    const userRole = req.user.role ? req.user.role.toLowerCase() : ""; 

    // 1. Fetch wallet balances and transaction rows
    const wallet = await prisma.wallet.findUnique({
      where: { userId: userId },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    // 2. Fetch linked bank account info based on the authenticated user's role profile
    let linkedBankAccount = "Not setup yet. Please email support.";
    
    if (userRole === "owner" || userRole === "admin") {
      const business = await prisma.business.findFirst({
        where: { ownerId: userId },
        include: { bankDetail: true }
      });
      if (business?.bankDetail) {
        linkedBankAccount = `${business.bankDetail.bankName} - ${business.bankDetail.accountNumber} (${business.bankDetail.accountName})`;
      }
    } else if (userRole === "rider") {
      const riderProfile = await prisma.riderProfile.findUnique({
        where: { userId: userId }
      });
      if (riderProfile?.bankName) {
        linkedBankAccount = `${riderProfile.bankName} - ${riderProfile.accountNumber} (${riderProfile.accountName})`;
      }
    }

    // ── 🌟 FIXED PAYLOAD: MATCHES FRONTEND UNIFIED STRUCTURAL EXPECTATIONS ──
    res.json({
      success: true,
      data: {
        wallet: {
          balance: wallet ? wallet.balance : 0.0,
          pendingPayouts: wallet ? wallet.pendingPayouts : 0.0,
          transactions: wallet ? wallet.transactions : []
        },
        hasBankDetails: linkedBankAccount !== "Not setup yet. Please email support.",
        linkedBankAccount: linkedBankAccount
      }
    });

  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to compile financial ledger", error: err.message });
  }
};


// ── ENDPOINT B: MANUALLY LINK EMAIL TO BANK DETAILS (For Super-Admin Only) ──
exports.manuallyLinkEmailBank = async (req, res) => {
  const { userEmail, userType, bankName, accountNumber, accountName } = req.body;

  try {
    const targetUser = await prisma.user.findUnique({ where: { email: userEmail } });
    if (!targetUser) return res.status(404).json({ message: "No profile found matching that email." });

    if (userType === "restaurant") {
      const activeBusiness = await prisma.business.findFirst({ where: { ownerId: targetUser.id } });
      if (!activeBusiness) return res.status(404).json({ message: "User is an owner but has no active business." });

      await prisma.businessBankDetail.upsert({
        where: { businessId: activeBusiness.id },
        update: { bankName, accountNumber, accountName },
        create: { businessId: activeBusiness.id, bankName, accountNumber, accountName }
      });
    } else if (userType === "rider") {
      await prisma.riderProfile.upsert({
        where: { userId: targetUser.id },
        update: { bankName, accountNumber, accountName },
        create: { 
          userId: targetUser.id, 
          bankName, 
          accountNumber, 
          accountName,
          vehicleType: "EMAIL_ONBOARDED", 
          idDocumentUrl: "EMAIL_ONBOARDED" 
        }
      });
    }

    // Ensure a wallet row is ready for future splits
    await prisma.wallet.upsert({
      where: { userId: targetUser.id },
      update: {},
      create: { userId: targetUser.id, balance: 0.0, pendingPayouts: 0.0 }
    });

    res.json({ message: "Financial payout routing parameters pinned successfully." });
  } catch (err) {
    res.status(500).json({ message: "Internal update failure", error: err.message });
  }
};

// ── ENDPOINT C: USER EXECUTES WITHDRAWAL REQUEST (Riders & Vendors) ──
exports.requestWithdrawal = async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role ? req.user.role.toLowerCase() : "";
  const { amount } = req.body;

  try {
    const amountNum = parseFloat(amount);
    if (!amountNum || isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json({ success: false, message: "Please provide a valid withdrawal amount." });
    }

    // 1. Fetch user's wallet, ensuring they have one initialized
    const wallet = await prisma.wallet.findUnique({
      where: { userId }
    });

    if (!wallet) {
      return res.status(404).json({ success: false, message: "Wallet not found for this user account." });
    }

    // 2. Validate that they actually have enough funds in their available balance
    if (wallet.balance < amountNum) {
      return res.status(400).json({ success: false, message: "Insufficient wallet balance for this request." });
    }

    // 3. Enforce the minimum payout thresholds configured on your Super-Admin settings page
    let thresholdKey = "payouts.restaurantThreshold";
    let defaultThreshold = 10000.0; // ₦10,000 baseline fallback for restaurants

    if (userRole === "rider") {
      thresholdKey = "payouts.riderThreshold";
      defaultThreshold = 5000.0; // ₦5,000 baseline fallback for riders
    }

    const thresholdSetting = await prisma.systemSetting.findUnique({
      where: { key: thresholdKey }
    });
    const minimumRequiredThreshold = thresholdSetting ? parseFloat(thresholdSetting.value) : defaultThreshold;

    if (wallet.balance < minimumRequiredThreshold) {
      return res.status(400).json({ 
        success: false, 
        message: `Your balance must be at least ₦${minimumRequiredThreshold.toLocaleString()} to request a payout.` 
      });
    }

    // 4. Double check that they actually have bank details bound to their account before requesting
    let hasMappedBank = false;
    if (userRole === "owner") {
      const business = await prisma.business.findFirst({
        where: { ownerId: userId },
        include: { bankDetail: true }
      });
      if (business?.bankDetail) hasMappedBank = true;
    } else if (userRole === "rider") {
      const riderProfile = await prisma.riderProfile.findUnique({
        where: { userId }
      });
      if (riderProfile?.bankName) hasMappedBank = true;
    }

    if (!hasMappedBank) {
      return res.status(400).json({ 
        success: false, 
        message: "Payout blocked: No bank account details linked. Please contact support via email." 
      });
    }

    // 5. Deduct atomically: the balance check is repeated inside the update so
    //    concurrent requests cannot overdraw the wallet.
    const reserved = await prisma.$transaction(async (tx) => {
      const debited = await tx.wallet.updateMany({
        where: { id: wallet.id, balance: { gte: amountNum } },
        data: {
          balance: { decrement: amountNum },
          pendingPayouts: { increment: amountNum }
        }
      });
      if (debited.count === 0) return false;

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amount: amountNum,
          type: "debit",
          status: "pending", // Appears on the Super-Admin payout queue
          description: "Manual Withdrawal Request (Awaiting Admin Bank Wire)"
        }
      });
      return true;
    });

    if (!reserved) {
      return res.status(400).json({ success: false, message: "Insufficient wallet balance for this request." });
    }

    res.json({ 
      success: true, 
      message: "Withdrawal request submitted successfully! Awaiting manual admin confirmation." 
    });

  } catch (err) {
    res.status(500).json({ success: false, message: "Withdrawal submission failed", error: err.message });
  }
};


// ── ENDPOINT D: SUPER-ADMIN COMPLETES OUTGOING PAYMENT SEED (Admin Only) ──
exports.resolveAdminPayout = async (req, res) => {
  const { transactionId } = req.params;

  try {
    // 1. Locate the targeted wallet transaction entry
    const transaction = await prisma.walletTransaction.findUnique({
      where: { id: transactionId },
      include: { wallet: true }
    });

    if (!transaction) {
      return res.status(404).json({ success: false, message: "Transaction ledger entry not found." });
    }

    // 2. Safeguard check to ensure we aren't clearing an already resolved item
    if (transaction.status !== "pending" || transaction.type !== "debit") {
      return res.status(400).json({ 
        success: false, 
        message: "Action Blocked: This layout node has already been processed or is an invalid structure." 
      });
    }

    // 3. Claim the pending row and release the hold in one transaction, so a
    //    double click / retry cannot flush pendingPayouts twice.
    const resolved = await prisma.$transaction(async (tx) => {
      const claimed = await tx.walletTransaction.updateMany({
        where: { id: transactionId, status: "pending", type: "debit" },
        data: { status: "completed" }
      });
      if (claimed.count === 0) return false;
      await tx.wallet.update({
        where: { id: transaction.walletId },
        data: { pendingPayouts: { decrement: transaction.amount } }
      });
      return true;
    });

    if (!resolved) {
      return res.status(409).json({ success: false, message: "This payout was already processed." });
    }

    res.json({ 
      success: true, 
      message: "Payout cleared and synchronized successfully! Ledger row updated." 
    });

  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to resolve settlement parameter", error: err.message });
  }
};

// ── ENDPOINT E: GET ADMIN LIVE METRICS & WITHDRAWAL QUEUE (Admin Only) ──
exports.getAdminFinancialQueueLogs = async (req, res) => {
  try {
    // 1. Fetch all wallet transactions with a status of "pending" and type of "debit" (Withdrawal requests)
    const pendingTransactions = await prisma.walletTransaction.findMany({
      where: {
        status: "pending",
        type: "debit"
      },
      include: {
        wallet: {
          include: {
            user: {
              include: {
                businesses: {
                  include: { bankDetail: true } // 🌟 Include bankDetail here so it displays in your queue tables!
                },
                riderProfile: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    // 2. Format the database records to match the exact keys expected by your Frontend Admin table
    const pendingWithdrawals = pendingTransactions.map(txn => {
      const user = txn.wallet?.user;
      const type = user?.role === "owner" ? "restaurant" : "rider";
      
      let recipientName = `${user?.firstName} ${user?.lastName}`;
      let bankDetails = "No account linked via email";

      if (type === "restaurant" && user?.businesses?.[0]) {
        recipientName = user.businesses[0].name;
        const details = user.businesses[0].bankDetail; 
        if (details) bankDetails = `${details.bankName} - ${details.accountNumber} (${details.accountName})`;
      } else if (type === "rider" && user?.riderProfile) {
        const profile = user.riderProfile;
        if (profile.bankName) bankDetails = `${profile.bankName} - ${profile.accountNumber} (${profile.accountName})`;
      }

      return {
        id: txn.id,
        recipientName,
        recipientEmail: user?.email || "unknown@oyaeat.com",
        type,
        requestedAmount: txn.amount,
        bankDetails,
        orderReference: txn.orderId ? `ORD-${txn.orderId}` : "MANUAL_REQUEST",
        originalOrderTotal: txn.amount, 
        adminSplitPercentage: 15,       
        createdAt: txn.createdAt
      };
    });

    // 3. Aggregate all wallet metrics across your system for your dashboard stats cards
    const wallets = await prisma.wallet.findMany();
    let restaurantOwedPool = 0;
    let riderOwedPool = 0;

    wallets.forEach(w => {
      if (w.userId === req.user.id) return; 
      restaurantOwedPool += w.balance + w.pendingPayouts;
    });

    // ── 🌟 NEW PART: FETCH AND FORMAT RECENTLY LINKED EMAIL BANK ACCOUNTS ──
    const businessBanks = await prisma.businessBankDetail.findMany({
      include: { 
        business: { 
          include: { owner: true } 
        } 
      }
    });

    const riderProfiles = await prisma.riderProfile.findMany({
      where: { bankName: { not: null } },
      include: { user: true }
    });

    const linkedAccounts = [
      ...businessBanks.map(b => ({
        id: `VND-BNK-${b.id}`,
        name: b.business.name,
        email: b.business.owner?.email || "unknown@oyaeat.com",
        type: "restaurant",
        bankString: `${b.bankName} - ${b.accountNumber} (${b.accountName})`,
        updatedAt: b.updatedAt
      })),
      ...riderProfiles.map(r => ({
        id: `RDR-BNK-${r.id}`,
        name: `${r.user.firstName} ${r.user.lastName}`,
        email: r.user.email,
        type: "rider",
        bankString: `${r.bankName} - ${r.accountNumber} (${r.accountName})`,
        updatedAt: r.updatedAt
      }))
    ];

    // 4. Compile the complete transaction payload including the new active mapping tracking records
    const responsePayload = {
      success: true,
      pendingWithdrawals,
      linkedAccounts, // 🌟 Sent over to populate your new admin archive table
      globalMetrics: {
        totalPlatformVolume: restaurantOwedPool * 1.15, 
        totalAdminCommission: restaurantOwedPool * 0.15,
        restaurantOwedPool,
        riderOwedPool: wallets.reduce((acc, w) => acc + (w.userId ? w.balance : 0), 0) * 0.2 
      }
    };

    res.json(responsePayload);
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to compile admin audit logs", error: err.message });
  }
};



