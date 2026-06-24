const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.submitOperationalAppeal = async (req, res) => {
  try {
    const { businessId, statement } = req.body;
    const file = req.file;

    if (!businessId || !statement?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Business authorization reference and rectification statement are required.',
      });
    }

    // 1. Locate business verification source of truth
    const business = await prisma.business.findUnique({
      where: { id: parseInt(businessId) },
    });

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Target business profile registry record not found.',
      });
    }

    // 2. Validate current status state integrity
    if (business.status !== 'suspended') {
      return res.status(400).json({
        success: false,
        message: 'This account profile layer is not currently under suspension restrictions.',
      });
    }

    // 3. Execute atomic transaction updates using Prisma
    const updatedBusiness = await prisma.$transaction(async (tx) => {
      
      
     // If a file was securely processed on Cloudinary, save its secure public web URL
if (file) {
  await tx.businessDocument.create({
    data: {
      businessId: parseInt(businessId),
      type: 'appeal_evidence',
      url: file.path, 
      fileName: file.originalname || 'Compliance Appeal Evidence Document' // ◄ Moved your name fallback here
    },
  });
}


      // Transition the store state so it flags back onto your superadmin review dashboard
      return await tx.business.update({
        where: { id: parseInt(businessId) },
        data: {
          status: 'pending_review', 
          suspensionType: null,     
          rejectionReason: `[Appeal Filed]: ${statement.trim()}`,
          hasDocuments: true
        },
      });
    });

    res.status(200).json({
      success: true,
      message: 'Operational appeal dossier accepted and securely hosted on Cloudinary repository files.',
      data: {
        businessStatus: updatedBusiness.status,
      },
    });

  } catch (error) {
    console.error('Critical appeal execution failure:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register operational compliance dispute documentation.',
      error: error.message,
    });
  }
};
