import { Op } from "sequelize";
import { sequelize } from "../config/database.js";
import PickWave from "../models/PIckWave.js";
import PickWaveOrder from "../models/PickWaveOrder.js";
import PickTask from "../models/PickTask.js";
import SalesOrder from "../models/SaleOrder.js";
import SalesOrderLine from "../models/SalesOrderLine.js";
import StockAllocation from "../models/StockAllocation.js";
import SKU from "../models/SKU.js";
import Location from "../models/Location.js";
import Warehouse from "../models/Warehouse.js";
import {
  generateWaveNo,
  generatePickTaskNo,
} from "../utils/sequenceGenerator.js";

// Get eligible orders for wave planning
// GET /api/pick-waves/eligible-orders
const getEligibleOrders = async (req, res, next) => {
  try {
    const { warehouse_id, priority, carrier } = req.query;

    if (!warehouse_id) {
      return res.status(400).json({ error: "warehouse_id is required" });
    }

    const where = {
      warehouse_id,
      status: {
        [Op.in]: ["ALLOCATED", "PARTIAL_ALLOCATION"],
      },
    };

    if (priority) where.priority = priority;
    if (carrier) where.carrier = carrier;

    // Exclude orders already in active waves
    const ordersInActiveWaves = await PickWaveOrder.findAll({
      attributes: ["order_id"],
      include: [
        {
          model: PickWave,
          as: "wave",
          where: {
            status: {
              [Op.in]: ["PENDING", "RELEASED", "IN_PROGRESS"],
            },
          },
        },
      ],
    });

    const excludedOrderIds = ordersInActiveWaves.map((wo) => wo.order_id);

    if (excludedOrderIds.length > 0) {
      where.id = {
        [Op.notIn]: excludedOrderIds,
      };
    }

    const orders = await SalesOrder.findAll({
      where,
      include: [
        {
          model: SalesOrderLine,
          as: "lines",
          include: [{ model: SKU, as: "sku" }],
        },
      ],
      order: [
        ["priority", "DESC"],
        ["sla_due_date", "ASC"],
        ["created_at", "ASC"],
      ],
    });

    res.json(orders);
  } catch (error) {
    next(error);
  }
};

// Create new pick wave
// POST /api/pick-waves
const createWave = async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const {
      warehouse_id,
      order_ids,
      wave_type = "MANUAL",
      wave_strategy = "BATCH",
      priority = "NORMAL",
      carrier,
      carrier_cutoff_time,
      zone_filter,
      notes,
    } = req.body;

    if (!warehouse_id || !order_ids || order_ids.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        error: "warehouse_id and order_ids are required",
      });
    }

    const orders = await SalesOrder.findAll({
      where: {
        id: order_ids,
        warehouse_id,
        status: {
          [Op.in]: ["ALLOCATED", "PARTIAL_ALLOCATION"],
        },
      },
      include: [{ model: SalesOrderLine, as: "lines" }],
      transaction,
    });

    if (orders.length !== order_ids.length) {
      await transaction.rollback();
      return res.status(400).json({
        error: "Some orders are not found or not eligible for wave",
      });
    }

    const totals = orders.reduce(
      (acc, order) => ({
        total_orders: acc.total_orders + 1,
        total_lines: acc.total_lines + order.lines.length,
        total_units:
          acc.total_units + parseFloat(order.total_allocated_units || 0),
      }),
      { total_orders: 0, total_lines: 0, total_units: 0 },
    );

    const waveNo = await generateWaveNo();

    const wave = await PickWave.create(
      {
        wave_no: waveNo,
        warehouse_id,
        wave_type,
        wave_strategy,
        priority,
        carrier,
        carrier_cutoff_time,
        zone_filter,
        ...totals,
        status: "PENDING",
        notes,
        created_by: req.user?.id,
      },
      { transaction },
    );

    const waveOrders = order_ids.map((order_id) => ({
      wave_id: wave.id,
      order_id,
    }));

    await PickWaveOrder.bulkCreate(waveOrders, { transaction });

    await transaction.commit();

    const completeWave = await PickWave.findByPk(wave.id, {
      include: [
        {
          model: SalesOrder,
          as: "orders",
          include: [{ model: SalesOrderLine, as: "lines" }],
        },
        { model: Warehouse, as: "warehouse" },
      ],
    });

    res.status(201).json({
      message: "Wave created successfully",
      wave: completeWave,
    });
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }
    next(error);
  }
};

// Get all waves with filters
// GET /api/pick-waves
const getAllWaves = async (req, res, next) => {
  try {
    const { warehouse_id, status, priority, page = 1, limit = 50 } = req.query;

    const where = {};
    if (warehouse_id) where.warehouse_id = warehouse_id;
    if (status) where.status = status;
    if (priority) where.priority = priority;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await PickWave.findAndCountAll({
      where,
      include: [
        {
          model: SalesOrder,
          as: "orders",
          include: [{ model: SalesOrderLine, as: "lines" }],
        },
        { model: Warehouse, as: "warehouse" },
      ],
      order: [["created_at", "DESC"]],
      limit: parseInt(limit),
      offset,
    });

    res.json({
      total: count,
      page: parseInt(page),
      pages: Math.ceil(count / parseInt(limit)),
      waves: rows,
    });
  } catch (error) {
    next(error);
  }
};

// Get wave by ID
// GET /api/pick-waves/:id
const getWaveById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const wave = await PickWave.findByPk(id, {
      include: [
        {
          model: SalesOrder,
          as: "orders",
          include: [{ model: SalesOrderLine, as: "lines" }],
        },
        {
          model: PickTask,
          as: "tasks",
          include: [
            { model: SKU, as: "sku" },
            {
              model: Location,
              as: "sourceLocation",
            },
          ],
        },
        { model: Warehouse, as: "warehouse" },
      ],
    });

    if (!wave) {
      return res.status(404).json({ error: "Wave not found" });
    }

    res.json(wave);
  } catch (error) {
    next(error);
  }
};

// Release wave and generate pick tasks
// POST /api/pick-waves/:id/release
const releaseWave = async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;

    const wave = await PickWave.findByPk(id, {
      include: [
        {
          model: SalesOrder,
          as: "orders",
          include: [
            {
              model: SalesOrderLine,
              as: "lines",
              include: [
                { model: SKU, as: "sku" },
                {
                  model: StockAllocation,
                  as: "allocations",
                  where: { status: "ACTIVE" },
                  include: [
                    {
                      model: Location,
                      as: "location",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      transaction,
    });

    if (!wave) {
      await transaction.rollback();
      return res.status(404).json({ error: "Wave not found" });
    }

    if (wave.status !== "PENDING") {
      await transaction.rollback();
      return res.status(400).json({
        error: `Wave already ${wave.status.toLowerCase()}`,
      });
    }

    const pickTasks = [];

    for (const order of wave.orders) {
      for (const line of order.lines) {
        for (const allocation of line.allocations) {
          const taskNo = await generatePickTaskNo();

          const pickTask = await PickTask.create(
            {
              task_no: taskNo,
              wave_id: wave.id,
              order_id: order.id,
              order_line_id: line.id,
              sku_id: line.sku_id,
              inventory_id: allocation.inventory_id,
              source_location_id: allocation.location_id,
              staging_location_id: null,
              qty_to_pick: allocation.remaining_qty,
              qty_picked: 0,
              qty_short: 0,
              batch_no: allocation.batch_no,
              serial_no: allocation.serial_no,
              expiry_date: allocation.expiry_date,
              status: "PENDING",
              priority:
                order.priority === "URGENT"
                  ? 1
                  : order.priority === "HIGH"
                    ? 3
                    : 5,
              pick_sequence: 0,
              created_by: req.user?.id,
            },
            { transaction },
          );

          pickTasks.push(pickTask);
        }
      }
    }

    await optimizePickSequence(wave.id, transaction);

    await wave.update(
      {
        status: "RELEASED",
        total_tasks: pickTasks.length,
        released_at: new Date(),
        released_by: req.user?.id,
      },
      { transaction },
    );

    const orderIds = wave.orders.map((order) => order.id);
    await SalesOrder.update(
      {
        status: "PICKING",
        picking_started_at: new Date(),
      },
      {
        where: { id: orderIds },
        transaction,
      },
    );

    await transaction.commit();

    res.json({
      message: "Wave released and pick tasks generated",
      wave_id: wave.id,
      tasks_generated: pickTasks.length,
    });
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }
    next(error);
  }
};

// Optimize pick sequence by location (zone → aisle → rack → level)
async function optimizePickSequence(waveId, transaction) {
  const tasks = await PickTask.findAll({
    where: { wave_id: waveId },
    include: [
      {
        model: Location,
        as: "sourceLocation",
        attributes: ["zone", "aisle", "rack", "level"],
      },
    ],
    order: [
      [{ model: Location, as: "sourceLocation" }, "zone", "ASC"],
      [{ model: Location, as: "sourceLocation" }, "aisle", "ASC"],
      [{ model: Location, as: "sourceLocation" }, "rack", "ASC"],
      [{ model: Location, as: "sourceLocation" }, "level", "ASC"],
    ],
    transaction,
  });

  for (let i = 0; i < tasks.length; i++) {
    await tasks[i].update({ pick_sequence: i + 1 }, { transaction });
  }
}

// Cancel wave
// POST /api/pick-waves/:id/cancel
const cancelWave = async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;
    const { cancellation_reason } = req.body;

    const wave = await PickWave.findByPk(id, { transaction });

    if (!wave) {
      await transaction.rollback();
      return res.status(404).json({ error: "Wave not found" });
    }

    if (!["PENDING", "RELEASED"].includes(wave.status)) {
      await transaction.rollback();
      return res.status(400).json({
        error: `Cannot cancel wave with status: ${wave.status}`,
      });
    }

    await PickTask.update(
      {
        status: "CANCELLED",
        cancelled_at: new Date(),
        cancellation_reason,
      },
      {
        where: { wave_id: id },
        transaction,
      },
    );

    await wave.update(
      {
        status: "CANCELLED",
        cancelled_at: new Date(),
        cancellation_reason,
      },
      { transaction },
    );

    const waveOrders = await PickWaveOrder.findAll({
      where: { wave_id: id },
      transaction,
    });

    const orderIds = waveOrders.map((wo) => wo.order_id);

    await SalesOrder.update(
      {
        status: "ALLOCATED",
        picking_started_at: null,
      },
      {
        where: { id: orderIds },
        transaction,
      },
    );

    await transaction.commit();

    res.json({ message: "Wave cancelled successfully" });
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }
    next(error);
  }
};

// Get wave statistics
// GET /api/pick-waves/stats
const getWaveStats = async (req, res, next) => {
  try {
    const { warehouse_id } = req.query;

    const where = {};
    if (warehouse_id) where.warehouse_id = warehouse_id;

    const stats = await PickWave.findAll({
      where,
      attributes: [
        "status",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
        [sequelize.fn("SUM", sequelize.col("total_orders")), "total_orders"],
        [sequelize.fn("SUM", sequelize.col("total_tasks")), "total_tasks"],
        [
          sequelize.fn("SUM", sequelize.col("completed_tasks")),
          "completed_tasks",
        ],
      ],
      group: ["status"],
    });

    res.json(stats);
  } catch (error) {
    next(error);
  }
};

const getWaveByOrderId = async (req, res, next) => {
  try {
    const { order_id } = req.params;

    const waveOrder = await PickWaveOrder.findOne({
      where: { order_id },
      include: [
        {
          model: PickWave,
          as: "wave",
          include: [
            {
              model: SalesOrder,
              as: "orders",
              include: [{ model: SalesOrderLine, as: "lines" }],
            },
            { model: Warehouse, as: "warehouse" },
          ],
        },
      ],
    });

    if (!waveOrder) {
      return res.status(404).json({ error: "Wave not found for this order" });
    }

    res.json(waveOrder.wave);
  } catch (error) {
    next(error);
  }
};

export {
  getEligibleOrders,
  createWave,
  getAllWaves,
  getWaveById,
  releaseWave,
  cancelWave,
  getWaveStats,
  getWaveByOrderId,
};
