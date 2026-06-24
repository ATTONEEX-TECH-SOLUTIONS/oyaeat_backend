const prisma = require('../lib/prisma')
const { getIo } = require('../socket/init');
const { sendPlatformNotification } = require('../services/emailService');

/**
 * Get all businesses pending review
 * GET /api/admin/businesses/pending
 */
exports.getPendingBusinesses = async (req, res) => {
  try {
    const businesses = await prisma.business.findMany({
      where: { status: 'pending_review' },
      include: {
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true
          }
        },
        documents: true,
        bankDetail: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json({
      success: true,
      data: { businesses }
    });
  } catch (error) {
    console.error('Get pending businesses error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending businesses',
      error: error.message
    });
  }
};

/**
 * Get all businesses (with filters & dynamic suspension parsing)
 * GET /api/admin/businesses
 */
exports.getAllBusinesses = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const where = status ? { status } : {};

    const [rawBusinesses, total] = await Promise.all([
      prisma.business.findMany({
        where,
        include: {
          owner: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true
            }
          },
          documents: true,
          bankDetail: true
        },
        orderBy: { createdAt: 'desc' },
        skip: parseInt(skip),
        take: parseInt(limit)
      }),
      prisma.business.count({ where })
    ]);

    // 🚀 THE FIX: Dynamically scan and attach suspension metadata virtual columns 
    // so your Superadmin UI can see if an account is shadow or main!
    const businesses = rawBusinesses.map((biz) => {
      let suspensionType = null;
      let cleanReason = biz.rejectionReason;

      if (biz.status === 'suspended' && biz.rejectionReason) {
        const rawReason = String(biz.rejectionReason).trim();
        if (/^MAIN:/i.test(rawReason)) {
          suspensionType = 'main';
          cleanReason = rawReason.replace(/^MAIN:\s*/i, '');
        } else {
          suspensionType = 'shadow';
          cleanReason = rawReason.replace(/^SHADOW:\s*/i, '');
        }
      }

      return {
        ...biz,
        suspensionType, // Virtual flag read by the frontend code structure
        rejectionReason: cleanReason // Returns clean text to your admin preview screens
      };
    });

    res.status(200).json({
      success: true,
      data: {
        businesses,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get all businesses error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch businesses',
      error: error.message
    });
  }
};

/**
 * Get business details by ID
 * GET /api/admin/businesses/:businessId
 */
exports.getBusinessById = async (req, res) => {
  try {
    const { businessId } = req.params;

    const business = await prisma.business.findUnique({
      where: { id: parseInt(businessId) },
      include: {
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            phoneVerified: true,
            createdAt: true
          }
        },
        documents: true,
        bankDetail: true
      }
    });

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found'
      });
    }

    res.status(200).json({
      success: true,
      data: { business }
    });
  } catch (error) {
    console.error('Get business by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch business',
      error: error.message
    });
  }
};

/**
 * Approve business
 * POST /api/admin/businesses/:businessId/approve
 */
exports.approveBusiness = async (req, res) => {
  try {
    const { businessId } = req.params;

    const business = await prisma.business.findUnique({
      where: { id: parseInt(businessId) }
    });

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found'
      });
    }

    // ── 1. STORE STATUS BEFORE DB TRANSACTION MUTATION ──────────────────────
    const previousStatus = business.status;
    // ─────────────────────────────────────────────────────────────────────────

    // ── FIXED STATUS GUARD LAYER ─────────────────────────────────────────────
    // This allows the operation to proceed whether it's an initial validation 
    // request OR an account reactivation workflow from a suspended state.
    if (previousStatus !== 'pending_review' && previousStatus !== 'suspended') {
      return res.status(400).json({
        success: false,
        message: 'Business is not pending review or suspended'
      });
    }
    // ─────────────────────────────────────────────────────────────────────────

    const updatedBusiness = await prisma.business.update({
      where: { id: parseInt(businessId) },
      data: {
        status: 'approved',
        rejectionReason: null // Clears out historical warning context tags automatically
      }
    });

    const targetEmail = business.businessEmail || (business.submitter && business.submitter.email);
    if (targetEmail) {
      // ── 2. NOW SAFE TO EVALUATE: Variable is accessible ──────────────────
      const isReactivation = previousStatus === 'suspended';

      sendPlatformNotification({
        to: targetEmail,
        businessName: updatedBusiness.name,
        themeKey: 'success', // Forest green theme colors
        headline: isReactivation ? 'Merchant Account Reactivated! 🎉' : 'Business Registration Approved! 🚀',
        paragraphText: isReactivation 
          ? 'Great news! Our administrative audit review is complete, and your store portal access has been fully restored. You are now authorized to resume active operations on the platform.'
          : 'Welcome to the network! Your onboarding application documentation was successfully validated. Your menu listings are live and visible to local customers starting now.'
      }).catch(err => console.error('Email background delivery failure:', err));
    }

    res.status(200).json({
      // ── 3. REUSED HERE AS WELL FOR PRECISE RESPONSE STRINGS ───────────────
      success: true,
      message: previousStatus === 'suspended' ? 'Business reactivated successfully' : 'Business approved successfully',
      data: { business: updatedBusiness }
    });
  } catch (error) {
    console.error('Approve business error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve business',
      error: error.message
    });
  }
};



/**
 * Reject business
 * POST /api/admin/businesses/:businessId/reject
 */
exports.rejectBusiness = async (req, res) => {
  try {
    const { businessId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    const business = await prisma.business.findUnique({
      where: { id: parseInt(businessId) }
    });

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found'
      });
    }

    if (business.status !== 'pending_review') {
      return res.status(400).json({
        success: false,
        message: 'Business is not pending review'
      });
    }

    const updatedBusiness = await prisma.business.update({
      where: { id: parseInt(businessId) },
      data: {
        status: 'rejected',
        rejectionReason: reason
      }
    });

     
  const targetEmail = business.businessEmail || (business.submitter && business.submitter.email);
  if (targetEmail) {
    sendPlatformNotification({
      to: targetEmail,
      businessName: business.name,
      themeKey: 'danger', // 👈 Red accent alerts formatting
      headline: 'Update Required: Registration Application Declined ❌',
      paragraphText: `Thank you for your interest in partnering with us. Unfortunately, your onboarding submission could not be verified in its current form due to compliance discrepancies. <br/><br/><strong>Official Reason Provided:</strong> "${reason}"<br/><br/>Please re-upload clear, valid identification records through your merchant portal to re-submit your profile layout.`,
    }).catch(err => console.error(err));
  }

    res.status(200).json({
      success: true,
      message: 'Business rejected',
      data: { business: updatedBusiness }
    });
  } catch (error) {
    console.error('Reject business error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject business',
      error: error.message
    });
  }
};

/**
 * Suspend business (Zero-migration strategy using string tags)
 * POST /api/admin/businesses/:businessId/suspend
 */
exports.suspendBusiness = async (req, res) => {
  try {
    const { businessId } = req.params;
    const { reason, suspensionType = 'shadow' } = req.body; 

    if (!['shadow', 'main'].includes(suspensionType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid suspension type parameters. Must be 'shadow' or 'main'."
      });
    }

    const business = await prisma.business.findUnique({
      where: { id: parseInt(businessId) }
    });

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business record not located'
      });
    }

    // 🚀 THE FIX: Instead of an unknown column, we bake the strategy directly into the text field!
    // Example output text inside your database: "SHADOW: The kitchen is too slow today."
    const packedReasonString = `${suspensionType.toUpperCase()}: ${reason.trim()}`;

    const updatedBusiness = await prisma.business.update({
      where: { id: parseInt(businessId) },
      data: {
        status: 'suspended', // Satisfies your pristine database Enum value perfectly
        rejectionReason: packedReasonString
      }
    });

    // Send notifications
    const targetEmail = business.businessEmail || (business.submitter && business.submitter.email);
    if (targetEmail) {
      let emailHeadline = suspensionType === 'shadow' ? 'Store Visibility Update: Store Hidden ⚠️' : 'Account Action Critical Notice: Operations Suspended 🚨';
      let emailParagraphText = suspensionType === 'shadow' 
        ? `Please be notified that your storefront has been temporarily hidden (Shadow Suspended) by platform operations.<br/><br/><strong>Reason:</strong> "${reason}"`
        : `Please be notified that your vendor dashboard profile access layer has been fully suspended.<br/><br/><strong>Reason:</strong> "${reason}"`;

      if (typeof sendPlatformNotification === 'function') {
        sendPlatformNotification({
          to: targetEmail,
          businessName: business.name,
          themeKey: suspensionType === 'shadow' ? 'warning' : 'danger', 
          headline: emailHeadline,
          paragraphText: emailParagraphText,
        }).catch(err => console.error('Notification dispatch error:', err));
      }
    }

    res.status(200).json({
      success: true,
      message: `Business successfully placed under ${suspensionType} suspension.`,
      data: { business: updatedBusiness }
    });
  } catch (error) {
    console.error('Suspend business operational error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete store suspension operation',
      error: error.message
    });
  }
};


/**
 * Get business statistics
 * GET /api/admin/businesses/stats
 */
exports.getBusinessStats = async (req, res) => {
  try {
    const [total, pending, approved, rejected, suspended] = await Promise.all([
      prisma.business.count(),
      prisma.business.count({ where: { status: 'pending_review' } }),
      prisma.business.count({ where: { status: 'approved' } }),
      prisma.business.count({ where: { status: 'rejected' } }),
      prisma.business.count({ where: { status: 'suspended' } })
    ]);

    res.status(200).json({
      success: true,
      data: {
        total,
        pending,
        approved,
        rejected,
        suspended
      }
    });
  } catch (error) {
    console.error('Get business stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: error.message
    });
  }
};

exports.getApprovedBusinesses = async (req, res) => {
  try {
    const businesses = await prisma.business.findMany({
      where: { status: 'approved' },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        documents: true,
        bankDetail: true
      },
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json({ success: true, data: { businesses } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch approved businesses', error: error.message });
  }
};

exports.getRejectedBusinesses = async (req, res) => {
  try {
    const businesses = await prisma.business.findMany({
      where: { status: 'rejected' },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        documents: true,
        bankDetail: true
      },
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json({ success: true, data: { businesses } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch rejected businesses', error: error.message });
  }
};

exports.getSuspendedBusinesses = async (req, res) => {
  try {
    const businesses = await prisma.business.findMany({
      where: { status: 'suspended' },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        documents: true,
        bankDetail: true
      },
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json({ success: true, data: { businesses } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch suspended businesses', error: error.message });
  }
};

/**
 * Get all global orders across all businesses
 * GET /admin/orders
 */
exports.getGlobalOrders = async (req, res) => {
  try {
    const { status, page = 1, limit = 200 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (status && status !== 'all') {
      where.status = status;
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          business: {
            select: { id: true, name: true }
          },
          customer: {
            select: { id: true, firstName: true, lastName: true, email: true, phone: true }
          },
          items: true
        },
        orderBy: { createdAt: 'desc' },
        skip: parseInt(skip),
        take: parseInt(limit)
      }),
      prisma.order.count({ where })
    ]);

    res.status(200).json({
      success: true,
      data: {
        orders,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Get all global orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch global orders',
      error: error.message
    });
  }
};





/**
 * Admin Action: Review, sanitize (edit), and broadcast vendor advertisement live
 * Route: PATCH /api/rider/admin/advert/:threadId/approve
 */
exports.sanitizeAndBroadcastAdvert = async (req, res) => {
  try {
    const { threadId } = req.params;
    // Admin has full permission to rewrite/sanitize the subject, content, or target role if needed
    const { sanitizedSubject, sanitizedContent, targetRole } = req.body;
    const adminId = parseInt(req.user.id, 10);

    if (!sanitizedContent) {
      return res.status(400).json({ success: false, message: 'Sanitized broadcast content is required' });
    }

    // 1. Verify the thread exists before running updates
    const existingThread = await prisma.thread.findUnique({
      where: { id: threadId }
    });

    if (!existingThread) {
      return res.status(404).json({ success: false, message: 'Advertisement thread not found.' });
    }

    // 2. Update thread state to open and commit sanitized subject modifications
    const updatedThread = await prisma.thread.update({
      where: { id: threadId },
      data: {
        status: 'open', // Flip status flag to open now that it's verified live
        subject: sanitizedSubject || existingThread.subject
      }
    });

    // 3. Create a clean message row representing the finalized approved copy
    const approvedMessage = await prisma.message.create({
      data: {
        threadId: updatedThread.id,
        senderId: adminId,
        senderRole: 'admin', // Signed off by admin
        content: sanitizedContent,
      }
    });

    const payload = {
      threadId: updatedThread.id,
      subject: updatedThread.subject,
      message: approvedMessage,
    };

    // 4. Safe WebSocket execution flow wrapper to prevent runtime crashes
    try {
      // Tries to pull from app injection first, falls back to function check if imported
      const io = req.app.get('io') || (typeof getIo === 'function' ? getIo() : null);
      
      if (io) {
        if (targetRole && targetRole !== 'all') {
          io.to(`role_${targetRole}`).emit('broadcast', payload);
        } else {
          io.emit('broadcast', payload);
        }
        console.log("Live real-time broadcast socket payload dispatched cleanly.");
      } else {
        console.warn("Socket.io engine not initialized. Broadcast data committed to DB only.");
      }
    } catch (socketError) {
      console.error("Socket emit failed gracefully, continuing response:", socketError.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Advertisement sanitized, approved, and broadcasted live successfully.',
      data: payload
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};



module.exports = exports;
