import { Op } from "sequelize";
import { sequelize } from "../config/database.js";
import SalesOrder from "../models/SaleOrder.js";
import SalesOrderLine from "../models/SalesOrderLine.js";
import Inventory from "../models/Inventory.js";
import StockAllocation from "../models/StockAllocation.js";
import SKU from "../models/SKU.js";
import { generateAllocationNo } from "../utils/sequenceGenerator.js";

/**
 * Allocate inventory for an entire order
 * Returns allocation result with status
 */
export async function allocateOrder(orderId, transaction) {
  const order = await SalesOrder.findByPk(orderId, {
    include: [
      {
        model: SalesOrderLine,
        include: [{ model: SKU, as: "sku" }],
        as: "lines",
      },
    ],
    transaction,
  });

  if (!order) {
    throw new Error("Order not found");
  }

  // TODO : check if we need a REALLOCATE status for orders that were previously allocated but had changes
  if (!["CONFIRMED", "PARTIAL_ALLOCATION"].includes(order.status)) {
    throw new Error(
      `Cannot allocate order with status: ${order.status}. Order must be CONFIRMED.`,
    );
  }

  let allLinesFullyAllocated = true;
  let anyLineAllocated = false;
  const allocationDetails = [];

  // Allocate each order line
  for (const line of order.lines) {
    const result = await allocateOrderLine(line, order, transaction);

    allocationDetails.push({
      line_id: line.id,
      sku_id: line.sku_id,
      ordered_qty: line.ordered_qty,
      allocated_qty: result.allocatedQty,
      short_qty: result.shortQty,
      allocations: result.allocations.length,
    });

    if (result.allocatedQty < line.ordered_qty) {
      allLinesFullyAllocated = false;
    }
    if (result.allocatedQty > 0) {
      anyLineAllocated = true;
    }
  }

  // Update order totals
  await updateOrderTotals(orderId, transaction);

  return {
    orderId,
    fullyAllocated: allLinesFullyAllocated,
    partiallyAllocated: !allLinesFullyAllocated && anyLineAllocated,
    noAllocation: !anyLineAllocated,
    details: allocationDetails,
  };
}

/**
 * Allocate inventory for a single order line
 * Supports FIFO, FEFO, LIFO allocation rules
 */
export async function allocateOrderLine(orderLine, order, transaction) {
  const {
    sku_id,
    ordered_qty,
    allocation_rule,
    order_id,
    id: order_line_id,
  } = orderLine;
  const warehouseId = order.warehouse_id;

  // Calculate remaining quantity to allocate
  const alreadyAllocated = await StockAllocation.sum("allocated_qty", {
    where: {
      order_line_id,
      status: "ACTIVE",
    },
    transaction,
  });

  const remainingToAllocate = ordered_qty - (alreadyAllocated || 0);

  if (remainingToAllocate <= 0) {
    return {
      allocatedQty: alreadyAllocated || 0,
      shortQty: 0,
      allocations: [],
    };
  }

  // Get allocation rule (from order line or SKU default)
  const rule = allocation_rule || orderLine.SKU?.pick_rule || "FIFO";

  // Find available inventory based on allocation rule
  let inventoryRecords = [];
  const baseWhere = {
    warehouse_id: warehouseId,
    sku_id: sku_id,
    status: "HEALTHY",
    [Op.and]: [
      sequelize.literal(
        "(on_hand_qty - allocated_qty - hold_qty - damaged_qty) > 0",
      ),
    ],
  };

  switch (rule) {
    case "FIFO":
      inventoryRecords = await Inventory.findAll({
        where: baseWhere,
        order: [["created_at", "ASC"]], // Oldest first
        transaction,
      });
      break;

    case "FEFO":
      inventoryRecords = await Inventory.findAll({
        where: {
          ...baseWhere,
          expiry_date: { [Op.ne]: null },
        },
        order: [["expiry_date", "ASC"]], // Earliest expiry first
        transaction,
      });
      break;

    case "LIFO":
      inventoryRecords = await Inventory.findAll({
        where: baseWhere,
        order: [["created_at", "DESC"]], // Newest first
        transaction,
      });
      break;

    default:
      throw new Error(`Invalid allocation rule: ${rule}`);
  }

  // Allocate from available inventory
  let remainingQty = remainingToAllocate;
  let totalAllocated = 0;
  const allocations = [];

  for (const inventory of inventoryRecords) {
    if (remainingQty <= 0) break;

    // Calculate available quantity for this inventory record
    const availableQty =
      parseFloat(inventory.on_hand_qty) -
      parseFloat(inventory.allocated_qty) -
      parseFloat(inventory.hold_qty) -
      parseFloat(inventory.damaged_qty);

    if (availableQty <= 0) continue;

    const qtyToAllocate = Math.min(remainingQty, availableQty);

    // Generate allocation number
    const allocationNo = await generateAllocationNo(transaction);

    // Create allocation record
    const allocation = await StockAllocation.create(
      {
        allocation_no: allocationNo,
        order_id,
        order_line_id,
        sku_id,
        inventory_id: inventory.id,
        location_id: inventory.location_id,
        warehouse_id: warehouseId,
        allocated_qty: qtyToAllocate,
        consumed_qty: 0,
        remaining_qty: qtyToAllocate,
        batch_no: inventory.batch_no,
        serial_no: inventory.serial_no,
        expiry_date: inventory.expiry_date,
        allocation_rule: rule,
        status: "ACTIVE",
        allocated_at: new Date(),
      },
      { transaction },
    );

    // Update inventory atomically — reserve stock
    await Inventory.update(
      {
        allocated_qty: sequelize.literal(`allocated_qty + ${qtyToAllocate}`),
        available_qty: sequelize.literal(`available_qty - ${qtyToAllocate}`),
      },
      { where: { id: inventory.id }, transaction },
    );

    allocations.push(allocation);
    totalAllocated += qtyToAllocate;
    remainingQty -= qtyToAllocate;
  }

  // Update order line
  const newAllocatedQty = (alreadyAllocated || 0) + totalAllocated;
  let lineStatus = "PENDING";

  if (newAllocatedQty >= ordered_qty) {
    lineStatus = "ALLOCATED";
  } else if (newAllocatedQty > 0) {
    lineStatus = "PARTIAL_ALLOCATION";
  }

  await orderLine.update(
    {
      allocated_qty: newAllocatedQty,
      status: lineStatus,
    },
    { transaction },
  );

  return {
    allocatedQty: totalAllocated,
    shortQty: remainingToAllocate - totalAllocated,
    allocations,
  };
}

/**
 * Release allocation (deallocate inventory)
 * Used for order cancellation or reallocation
 */
export async function releaseAllocation(allocationId, reason, transaction) {
  const allocation = await StockAllocation.findByPk(allocationId, {
    include: [
      { model: Inventory, as: "inventory" },
      { model: SalesOrderLine, as: "orderLine" },
    ],
    transaction,
  });

  if (!allocation) {
    throw new Error("Allocation not found");
  }

  if (allocation.status !== "ACTIVE") {
    throw new Error(
      `Cannot release allocation with status: ${allocation.status}`,
    );
  }

  // Calculate quantity to release (allocated but not yet consumed)
  const qtyToRelease = allocation.remaining_qty;

  // Update inventory atomically — restore reserved stock back to available
  await Inventory.update(
    {
      allocated_qty: sequelize.literal(`allocated_qty - ${qtyToRelease}`),
      available_qty: sequelize.literal(`available_qty + ${qtyToRelease}`),
    },
    { where: { id: allocation.inventory_id }, transaction },
  );

  // Update allocation status
  await allocation.update(
    {
      status: "RELEASED",
      released_at: new Date(),
      released_reason: reason,
      remaining_qty: 0,
    },
    { transaction },
  );

  // Update order line
  const orderLine = allocation.orderLine;
  const newAllocatedQty =
    parseFloat(orderLine.allocated_qty) - allocation.allocated_qty;

  await orderLine.update(
    {
      allocated_qty: newAllocatedQty,
      status: newAllocatedQty === 0 ? "PENDING" : "PARTIAL_ALLOCATION",
    },
    { transaction },
  );

  return {
    released: true,
    qty_released: qtyToRelease,
  };
}

/**
 * Release all allocations for an order
 * Used for order cancellation
 */
export async function releaseOrderAllocations(orderId, reason, transaction) {
  const allocations = await StockAllocation.findAll({
    where: {
      order_id: orderId,
      status: "ACTIVE",
    },
    transaction,
  });

  const results = [];

  for (const allocation of allocations) {
    const result = await releaseAllocation(allocation.id, reason, transaction);
    results.push(result);
  }

  // Update order totals
  await updateOrderTotals(orderId, transaction);

  return {
    released_count: results.length,
    total_qty_released: results.reduce(
      (sum, r) => sum + Number(r.qty_released),
      0,
    ),
  };
}

/**
 * Update order aggregate totals
 * Called after allocation changes
 */
async function updateOrderTotals(orderId, transaction) {
  const lines = await SalesOrderLine.findAll({
    where: { order_id: orderId },
    transaction,
  });

  const totals = lines.reduce(
    (acc, line) => ({
      total_lines: acc.total_lines + 1,
      total_ordered_units:
        acc.total_ordered_units + parseFloat(line.ordered_qty),
      total_allocated_units:
        acc.total_allocated_units + parseFloat(line.allocated_qty),
    }),
    { total_lines: 0, total_ordered_units: 0, total_allocated_units: 0 },
  );

  await SalesOrder.update(totals, {
    where: { id: orderId },
    transaction,
  });

  return totals;
}
