import { Pallet, Warehouse } from "../models/index.js";

// Generate Pallet ID
const generatePalletID = async () => {
  const lastPallet = await Pallet.findOne({
    order: [["id", "DESC"]],
  });

  const nextNumber = lastPallet ? lastPallet.id + 1 : 1;
  return `P-${String(nextNumber).padStart(5, "0")}`;
};

// Get all pallets
const getAllPallets = async (req, res, next) => {
  try {
    const { warehouse_id, status, page = 1, limit = 10 } = req.query;

    const whereClause = {};
    if (warehouse_id) whereClause.warehouse_id = warehouse_id;
    if (status) whereClause.status = status;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows: pallets } = await Pallet.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Warehouse,
          as: "warehouse",
          attributes: ["id", "warehouse_name", "warehouse_code"],
        },
      ],
      order: [["created_at", "DESC"]],
      limit: parseInt(limit),
      offset,
    });

    res.json({
      success: true,
      data: pallets,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get pallet by ID
const getPalletById = async (req, res, next) => {
  try {
    const pallet = await Pallet.findByPk(req.params.id, {
      include: [
        {
          model: Warehouse,
          as: "warehouse",
        },
      ],
    });

    if (!pallet) {
      return res.status(404).json({
        success: false,
        message: "Pallet not found",
      });
    }

    res.json({
      success: true,
      data: pallet,
    });
  } catch (error) {
    next(error);
  }
};

// Create pallet
const createPallet = async (req, res, next) => {
  try {
    const { warehouse_id, pallet_type, current_location } = req.body;

    // Verify warehouse exists
    const warehouse = await Warehouse.findByPk(warehouse_id);
    if (!warehouse) {
      return res.status(404).json({
        success: false,
        message: "Warehouse not found",
      });
    }

    // Generate pallet ID
    const pallet_id = await generatePalletID();

    const pallet = await Pallet.create({
      pallet_id,
      warehouse_id,
      pallet_type,
      current_location,
      status: "EMPTY",
    });

    res.status(201).json({
      success: true,
      message: "Pallet created successfully",
      data: pallet,
    });
  } catch (error) {
    next(error);
  }
};

// Update pallet location
const updatePalletLocation = async (req, res, next) => {
  try {
    const pallet = await Pallet.findByPk(req.params.id);

    if (!pallet) {
      return res.status(404).json({
        success: false,
        message: "Pallet not found",
      });
    }

    const { current_location, status } = req.body;

    await pallet.update({
      current_location,
      status,
    });

    res.json({
      success: true,
      message: "Pallet updated successfully",
      data: pallet,
    });
  } catch (error) {
    next(error);
  }
};

// Delete pallet
const deletePallet = async (req, res, next) => {
  try {
    const pallet = await Pallet.findByPk(req.params.id);

    if (!pallet) {
      return res.status(404).json({
        success: false,
        message: "Pallet not found",
      });
    }

    if (pallet.status !== "EMPTY") {
      return res.status(400).json({
        success: false,
        message: "Cannot delete pallet that is not empty",
      });
    }

    await pallet.destroy();

    res.json({
      success: true,
      message: "Pallet deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

export {
  getAllPallets,
  getPalletById,
  createPallet,
  updatePalletLocation,
  deletePallet,
  generatePalletID,
};
