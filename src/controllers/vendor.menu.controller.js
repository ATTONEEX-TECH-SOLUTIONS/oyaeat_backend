// src/controllers/vendor.menu.controller.js

const prisma = require("../lib/prisma");
const cloudinary = require("../lib/cloudinary");
const fs = require("fs");

async function getOwnerBusiness(req) {
  const ownerId = req.user.id;

  return prisma.business.findFirst({
    where: { ownerId },
    select: { id: true, status: true, name: true },
  });
}

async function uploadMenuImage(filePath) {
  return cloudinary.uploader.upload(filePath, {
    folder: "oyaeat/menu-items",
    resource_type: "image",
  });
}

function cleanupLocalFile(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

exports.getMenu = async (req, res) => {
  try {
    const business = await getOwnerBusiness(req);

    if (!business) {
      return res.status(404).json({
        success: false,
        message: "No business found",
      });
    }

    const items = await prisma.menuItem.findMany({
      where: { businessId: business.id },
      orderBy: { createdAt: "desc" },
    });

    return res.json({
      success: true,
      data: { business, items },
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch menu",
      error: e.message,
    });
  }
};

exports.createMenuItem = async (req, res) => {
  try {
    const business = await getOwnerBusiness(req);

    if (!business) {
      cleanupLocalFile(req.file?.path);
      return res.status(404).json({
        success: false,
        message: "No business found",
      });
    }

    const { name, category, price, description, available } = req.body;

    if (!name || !category || price == null) {
      cleanupLocalFile(req.file?.path);
      return res.status(400).json({
        success: false,
        message: "name, category and price are required",
      });
    }

    let imageUrl = null;
    let imagePublicId = null;

    if (req.file) {
      const uploadedImage = await uploadMenuImage(req.file.path);
      imageUrl = uploadedImage.secure_url;
      imagePublicId = uploadedImage.public_id;

      cleanupLocalFile(req.file.path);
    }

    const item = await prisma.menuItem.create({
      data: {
        businessId: business.id,
        name: name.trim(),
        category: category.trim(),
        price: Number(price),
        description: description ? description.trim() : null,
        imageUrl,
        imagePublicId,
        available: available !== undefined ? available === "true" : true,
      },
    });

    return res.status(201).json({
      success: true,
      data: { item },
    });
  } catch (e) {
    cleanupLocalFile(req.file?.path);

    return res.status(500).json({
      success: false,
      message: "Failed to create item",
      error: e.message,
    });
  }
};

exports.updateMenuItem = async (req, res) => {
  try {
    const business = await getOwnerBusiness(req);

    if (!business) {
      cleanupLocalFile(req.file?.path);
      return res.status(404).json({
        success: false,
        message: "No business found",
      });
    }

    const itemId = parseInt(req.params.itemId, 10);

    const existing = await prisma.menuItem.findFirst({
      where: {
        id: itemId,
        businessId: business.id,
      },
    });

    if (!existing) {
      cleanupLocalFile(req.file?.path);
      return res.status(404).json({
        success: false,
        message: "Menu item not found",
      });
    }

    const { name, category, price, description, available } = req.body;

    let imageUrl = existing.imageUrl;
    let imagePublicId = existing.imagePublicId || null;

    if (req.file) {
      const uploadedImage = await uploadMenuImage(req.file.path);
      imageUrl = uploadedImage.secure_url;
      imagePublicId = uploadedImage.public_id;

      cleanupLocalFile(req.file.path);

      if (existing.imagePublicId) {
        await cloudinary.uploader.destroy(existing.imagePublicId);
      }
    }

    const item = await prisma.menuItem.update({
      where: { id: itemId },
      data: {
        name: name === undefined ? undefined : name.trim(),
        category: category === undefined ? undefined : category.trim(),
        price: price != null ? Number(price) : undefined,
        description:
          description === undefined
            ? undefined
            : description
            ? description.trim()
            : null,
        imageUrl,
        imagePublicId,
        available:
          available === undefined ? undefined : available === "true",
      },
    });

    return res.json({
      success: true,
      data: { item },
    });
  } catch (e) {
    cleanupLocalFile(req.file?.path);

    return res.status(500).json({
      success: false,
      message: "Failed to update item",
      error: e.message,
    });
  }
};

exports.deleteMenuItem = async (req, res) => {
  try {
    const business = await getOwnerBusiness(req);

    if (!business) {
      return res.status(404).json({
        success: false,
        message: "No business found",
      });
    }

    const itemId = parseInt(req.params.itemId, 10);

    const existing = await prisma.menuItem.findFirst({
      where: {
        id: itemId,
        businessId: business.id,
      },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Menu item not found",
      });
    }

    if (existing.imagePublicId) {
      await cloudinary.uploader.destroy(existing.imagePublicId);
    }

    await prisma.menuItem.delete({
      where: { id: itemId },
    });

    return res.json({
      success: true,
      message: "Menu item deleted",
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      message: "Failed to delete item",
      error: e.message,
    });
  }
};