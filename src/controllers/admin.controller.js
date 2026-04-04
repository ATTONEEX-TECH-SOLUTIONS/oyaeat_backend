const prisma = require('../lib/prisma');

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
 * Get all businesses (with filters)
 * GET /api/admin/businesses
 */
exports.getAllBusinesses = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const where = status ? { status } : {};

    const [businesses, total] = await Promise.all([
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

    if (business.status !== 'pending_review') {
      return res.status(400).json({
        success: false,
        message: 'Business is not pending review'
      });
    }

    const updatedBusiness = await prisma.business.update({
      where: { id: parseInt(businessId) },
      data: {
        status: 'approved',
        rejectionReason: null
      }
    });

    // TODO: Send notification email to vendor
    // await sendEmail(business.businessEmail, 'Business Approved', ...);

    res.status(200).json({
      success: true,
      message: 'Business approved successfully',
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

    // TODO: Send notification email to vendor
    // await sendEmail(business.businessEmail, 'Business Rejected', ...);

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
 * Suspend business
 * POST /api/admin/businesses/:businessId/suspend
 */
exports.suspendBusiness = async (req, res) => {
  try {
    const { businessId } = req.params;
    const { reason } = req.body;

    const business = await prisma.business.findUnique({
      where: { id: parseInt(businessId) }
    });

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found'
      });
    }

    const updatedBusiness = await prisma.business.update({
      where: { id: parseInt(businessId) },
      data: {
        status: 'suspended',
        rejectionReason: reason
      }
    });

    res.status(200).json({
      success: true,
      message: 'Business suspended',
      data: { business: updatedBusiness }
    });
  } catch (error) {
    console.error('Suspend business error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to suspend business',
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

module.exports = exports;
