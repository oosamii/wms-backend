import { Op } from "sequelize";
import { sequelize } from "../config/database.js";
import {
  SalesOrder,
  SalesOrderLine,
  Carton,
  CartonItem,
  SKU,
} from "../models/index.js";
import { createBillableEvent } from "../utils/billingHelpers.js";

/**
 * Generate sequential Carton number
 * Format: CTN-00001
 */
async function generateCartonNo(transaction) {
  const lastCarton = await Carton.findOne({
    order: [["id", "DESC"]],
    attributes: ["carton_no"],
    transaction,
  });

  if (!lastCarton) {
    return "CTN-00001";
  }

  const lastNumber = parseInt(lastCarton.carton_no.split("-")[1]);
  return `CTN-${String(lastNumber + 1).padStart(5, "0")}`;
}

// POST /api/packing/:orderId/start
// Transition order from PICKED → PACKING, assign packer
const startPacking = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const order = await SalesOrder.findByPk(req.params.orderId, {
      transaction,
    });

    if (!order) {
      await transaction.rollback();
      return res
        .status(404)
        .json({ success: false, message: "Sales order not found" });
    }

    if (order.status !== "PICKED") {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Order status must be PICKED to start packing. Current status: ${order.status}`,
      });
    }

    await order.update(
      {
        status: "PACKING",
        packing_started_at: new Date(),
        updated_by: req.user?.id || null,
      },
      { transaction },
    );

    await transaction.commit();

    res.json({
      success: true,
      message: "Packing started",
      data: order,
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

// POST /api/packing/:orderId/cartons
// Create a new carton (OPEN) for the order
const createCarton = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const order = await SalesOrder.findByPk(req.params.orderId, {
      transaction,
    });

    if (!order) {
      await transaction.rollback();
      return res
        .status(404)
        .json({ success: false, message: "Sales order not found" });
    }

    if (order.status !== "PACKING") {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Order must be in PACKING status. Current status: ${order.status}`,
      });
    }

    const { carton_type, length, width, height, tare_weight, notes } = req.body;

    const carton_no = await generateCartonNo(transaction);

    const carton = await Carton.create(
      {
        carton_no,
        sales_order_id: order.id,
        warehouse_id: order.warehouse_id,
        carton_type: carton_type || "MEDIUM",
        length,
        width,
        height,
        tare_weight,
        notes,
        packed_by: req.user?.id || null,
        created_by: req.user?.id || null,
      },
      { transaction },
    );

    await transaction.commit();

    res.status(201).json({
      success: true,
      message: "Carton created",
      data: carton,
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

// POST /api/packing/:orderId/cartons/:cartonId/items
// Add item to carton
const addItemToCarton = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { orderId, cartonId } = req.params;
    const {
      sales_order_line_id,
      sku_id,
      qty,
      batch_no,
      serial_no,
      expiry_date,
    } = req.body;

    if (!sales_order_line_id || !sku_id || !qty || qty <= 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "sales_order_line_id, sku_id, and qty (> 0) are required",
      });
    }

    // Validate order
    const order = await SalesOrder.findByPk(orderId, { transaction });
    if (!order || order.status !== "PACKING") {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: order
          ? `Order must be in PACKING status. Current: ${order.status}`
          : "Sales order not found",
      });
    }

    // Validate carton belongs to this order and is OPEN
    const carton = await Carton.findOne({
      where: { id: cartonId, sales_order_id: orderId },
      transaction,
    });

    if (!carton) {
      await transaction.rollback();
      return res
        .status(404)
        .json({ success: false, message: "Carton not found for this order" });
    }

    if (carton.status !== "OPEN") {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Carton is ${carton.status}. Only OPEN cartons can accept items`,
      });
    }

    // Validate order line belongs to this order
    const orderLine = await SalesOrderLine.findOne({
      where: { id: sales_order_line_id, order_id: orderId },
      transaction,
    });

    if (!orderLine) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Sales order line not found for this order",
      });
    }

    // Validate packed qty does not exceed picked qty
    const alreadyPacked =
      (await CartonItem.sum("qty", {
        where: { sales_order_line_id },
        include: [
          {
            model: Carton,
            where: { sales_order_id: orderId },
            attributes: [],
          },
        ],
        transaction,
      })) || 0;

    if (alreadyPacked + qty > Number(orderLine.picked_qty)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Cannot pack ${qty} units. Already packed: ${alreadyPacked}, picked: ${orderLine.picked_qty}. Would exceed picked quantity.`,
      });
    }

    // Create carton item
    const cartonItem = await CartonItem.create(
      {
        carton_id: carton.id,
        sales_order_line_id,
        sku_id,
        qty,
        batch_no,
        serial_no,
        expiry_date,
        created_by: req.user?.id || null,
      },
      { transaction },
    );

    // Update carton total_items
    await carton.update(
      { total_items: carton.total_items + qty },
      { transaction },
    );

    // Update order line packed_qty
    await orderLine.update(
      { packed_qty: Number(orderLine.packed_qty) + qty },
      { transaction },
    );

    // Update order total_packed_units
    await order.update(
      { total_packed_units: Number(order.total_packed_units) + qty },
      { transaction },
    );

    await transaction.commit();

    res.status(201).json({
      success: true,
      message: "Item added to carton",
      data: cartonItem,
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

// DELETE /api/packing/:orderId/cartons/:cartonId/items/:itemId
// Remove item from carton
const removeItemFromCarton = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { orderId, cartonId, itemId } = req.params;

    const carton = await Carton.findOne({
      where: { id: cartonId, sales_order_id: orderId },
      transaction,
    });

    if (!carton) {
      await transaction.rollback();
      return res
        .status(404)
        .json({ success: false, message: "Carton not found for this order" });
    }

    if (carton.status !== "OPEN") {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Carton is ${carton.status}. Only OPEN cartons can have items removed`,
      });
    }

    const cartonItem = await CartonItem.findOne({
      where: { id: itemId, carton_id: cartonId },
      transaction,
    });

    if (!cartonItem) {
      await transaction.rollback();
      return res
        .status(404)
        .json({ success: false, message: "Carton item not found" });
    }

    const removedQty = cartonItem.qty;

    // Reverse packed_qty on order line
    const orderLine = await SalesOrderLine.findByPk(
      cartonItem.sales_order_line_id,
      { transaction },
    );
    if (orderLine) {
      await orderLine.update(
        { packed_qty: Math.max(0, Number(orderLine.packed_qty) - removedQty) },
        { transaction },
      );
    }

    // Reverse total_packed_units on order
    const order = await SalesOrder.findByPk(orderId, { transaction });
    if (order) {
      await order.update(
        {
          total_packed_units: Math.max(
            0,
            Number(order.total_packed_units) - removedQty,
          ),
        },
        { transaction },
      );
    }

    // Update carton total_items
    await carton.update(
      { total_items: Math.max(0, carton.total_items - removedQty) },
      { transaction },
    );

    await cartonItem.destroy({ transaction });

    await transaction.commit();

    res.json({
      success: true,
      message: "Item removed from carton",
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

// PUT /api/packing/:orderId/cartons/:cartonId/close
// Close carton, set weight
const closeCarton = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { orderId, cartonId } = req.params;

    const carton = await Carton.findOne({
      where: { id: cartonId, sales_order_id: orderId },
      include: [{ model: CartonItem, as: "items" }],
      transaction,
    });

    if (!carton) {
      await transaction.rollback();
      return res
        .status(404)
        .json({ success: false, message: "Carton not found for this order" });
    }

    if (carton.status !== "OPEN") {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Carton is already ${carton.status}`,
      });
    }

    if (!carton.items || carton.items.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Cannot close an empty carton",
      });
    }

    const { gross_weight, net_weight } = req.body;

    await carton.update(
      {
        status: "CLOSED",
        gross_weight: gross_weight || null,
        net_weight: net_weight || null,
        closed_at: new Date(),
        updated_by: req.user?.id || null,
      },
      { transaction },
    );

    await transaction.commit();

    res.json({
      success: true,
      message: "Carton closed",
      data: carton,
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

// POST /api/packing/:orderId/finalize
// All items packed? → status PACKED
const finalizePacking = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const order = await SalesOrder.findByPk(req.params.orderId, {
      include: [
        { model: SalesOrderLine, as: "lines" },
        { model: Carton, as: "cartons" },
      ],
      transaction,
    });

    if (!order) {
      await transaction.rollback();
      return res
        .status(404)
        .json({ success: false, message: "Sales order not found" });
    }

    if (order.status !== "PACKING") {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Order must be in PACKING status. Current: ${order.status}`,
      });
    }

    // Check all cartons are closed
    const openCartons = order.cartons.filter((c) => c.status === "OPEN");
    if (openCartons.length > 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `${openCartons.length} carton(s) are still OPEN. Close all cartons before finalizing.`,
      });
    }

    if (order.cartons.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message:
          "No cartons found. Create and pack at least one carton before finalizing.",
      });
    }

    // Check all picked items are packed
    const unpackedLines = order.lines.filter(
      (line) =>
        line.status !== "CANCELLED" &&
        Number(line.packed_qty) < Number(line.picked_qty),
    );

    if (unpackedLines.length > 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `${unpackedLines.length} line(s) have unpacked items. All picked quantities must be packed.`,
        data: unpackedLines.map((l) => ({
          line_no: l.line_no,
          picked_qty: l.picked_qty,
          packed_qty: l.packed_qty,
        })),
      });
    }

    // Update order line statuses to PACKED
    await SalesOrderLine.update(
      { status: "PACKED" },
      {
        where: {
          order_id: order.id,
          status: { [Op.ne]: "CANCELLED" },
        },
        transaction,
      },
    );

    await order.update(
      {
        status: "PACKED",
        packing_completed_at: new Date(),
        updated_by: req.user?.id || null,
      },
      { transaction },
    );

    await createBillableEvent({
      warehouse_id: order.warehouse_id,
      client_id: order.client_id,
      charge_type: "PACKING",
      reference_type: "SALES_ORDER",
      reference_id: order.id,
      reference_no: order.order_no,
      qty: order.total_packed_units,
      event_date: new Date(),
      created_by: req.user?.id || null,
      transaction,
    });

    await transaction.commit();

    res.json({
      success: true,
      message: "Packing finalized. Order is now PACKED.",
      data: order,
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

// DELETE /api/packing/:orderId/cartons/:cartonId
// Delete a carton; if it has items, revert packed quantities first
const deleteCarton = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { orderId, cartonId } = req.params;

    const order = await SalesOrder.findByPk(orderId, { transaction });
    if (!order || order.status !== "PACKING") {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: order
          ? `Order must be in PACKING status. Current: ${order.status}`
          : "Sales order not found",
      });
    }

    const carton = await Carton.findOne({
      where: { id: cartonId, sales_order_id: orderId },
      include: [{ model: CartonItem, as: "items" }],
      transaction,
    });

    if (!carton) {
      await transaction.rollback();
      return res
        .status(404)
        .json({ success: false, message: "Carton not found for this order" });
    }

    if (carton.status !== "OPEN") {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Carton is ${carton.status}. Only OPEN cartons can be deleted`,
      });
    }

    // Revert packed quantities for each item in the carton
    if (carton.items && carton.items.length > 0) {
      // Aggregate qty per order line to minimise DB updates
      const qtyByLine = {};
      let totalRevertQty = 0;

      for (const item of carton.items) {
        const lineId = item.sales_order_line_id;
        qtyByLine[lineId] = (qtyByLine[lineId] || 0) + item.qty;
        totalRevertQty += item.qty;
      }

      // Revert packed_qty on each affected order line
      for (const [lineId, revertQty] of Object.entries(qtyByLine)) {
        const orderLine = await SalesOrderLine.findByPk(lineId, {
          transaction,
        });
        if (orderLine) {
          await orderLine.update(
            {
              packed_qty: Math.max(0, Number(orderLine.packed_qty) - revertQty),
            },
            { transaction },
          );
        }
      }

      // Revert total_packed_units on the order
      await order.update(
        {
          total_packed_units: Math.max(
            0,
            Number(order.total_packed_units) - totalRevertQty,
          ),
        },
        { transaction },
      );

      // Delete all carton items
      await CartonItem.destroy({
        where: { carton_id: carton.id },
        transaction,
      });
    }

    // Delete the carton
    await carton.destroy({ transaction });

    await transaction.commit();

    res.json({
      success: true,
      message: "Carton deleted",
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

// GET /api/packing/:orderId/cartons
// Fetch all cartons for the order with their items
const getOrderCartons = async (req, res, next) => {
  try {
    const order = await SalesOrder.findByPk(req.params.orderId);

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Sales order not found" });
    }

    const cartons = await Carton.findAll({
      where: { sales_order_id: req.params.orderId },
      include: [
        {
          model: CartonItem,
          as: "items",
          include: [{ model: SKU, as: "sku" }],
        },
      ],
      order: [["created_at", "ASC"]],
    });

    res.json({
      success: true,
      data: {
        order_id: order.id,
        order_no: order.order_no,
        order_status: order.status,
        total_cartons: cartons.length,
        cartons,
      },
    });
  } catch (error) {
    next(error);
  }
};

export {
  startPacking,
  createCarton,
  addItemToCarton,
  removeItemFromCarton,
  deleteCarton,
  closeCarton,
  finalizePacking,
  getOrderCartons,
};
