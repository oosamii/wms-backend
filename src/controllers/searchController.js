// src/controllers/searchController.js
import { Op } from "sequelize";
import {
  ASN,
  GRN,
  GRNLine,
  SKU,
  Pallet,
  Client,
  Supplier,
  Location,
  InventoryTransaction,
  SalesOrder,
} from "../models/index.js";

// ─────────────────────────────────────────────
// 1. STATIC NAVIGATION ITEMS (no DB query)
//    Add any page/action you want searchable
// ─────────────────────────────────────────────

const NAV_ITEMS = [
  { display: "Dashboard", subtitle: "Overview & metrics", route: "/dashboard" },
  {
    display: "Inbound Operations",
    subtitle: "ASN, GRN, Receiving",
    route: "/inbound",
  },
  {
    display: "Create ASN",
    subtitle: "Start new inbound shipment",
    route: "/inbound/createASN/new",
  },
  {
    display: "Receive GRN",
    subtitle: "Receive goods at dock",
    route: "/inbound/grns/receive",
  },
  {
    display: "Putaway Tasks",
    subtitle: "Manage putaway queue",
    route: "/putaway",
  },
  {
    display: "Inventory",
    subtitle: "Stock levels & locations",
    route: "/inventory",
  },
  {
    display: "Inventory Holds",
    subtitle: "QC holds & quarantine",
    route: "/inventory",
  },
  {
    display: "Outbound Orders",
    subtitle: "Sales orders & dispatch",
    route: "/outbound",
  },
  {
    display: "Create Sales Order",
    subtitle: "Start new outbound order",
    route: "/outbound/saleOrderCreate/new",
  },
  {
    display: "Picking",
    subtitle: "Pick lists & pick tasks",
    route: "/picking",
  },
  {
    display: "Start Picking Wave",
    subtitle: "Launch a new pick wave",
    route: "/picking/createPickWavePage",
  },
  {
    display: "Packing",
    subtitle: "Pack & carton management",
    route: "/packing",
  },
  {
    display: "Shipping",
    subtitle: "Dispatch & carrier mgmt",
    route: "/shipping",
  },
  {
    display: "Clients",
    subtitle: "Client master data",
    route: "/masters?tab=clients",
  },
  {
    display: "Suppliers",
    subtitle: "Supplier master data",
    route: "/masters?tab=suppliers",
  },
  { display: "SKUs", subtitle: "Product catalog", route: "/masters?tab=skus" },
  {
    display: "Locations",
    subtitle: "Warehouse bin locations",
    route: "/masters?tab=locations-bins",
  },
  {
    display: "Generate Invoice",
    subtitle: "Billing & GST invoices",
    route: "/billing?tab=invoiced",
  },
  { display: "Reports", subtitle: "Analytics & exports", route: "/reports" },
  {
    display: "User Management",
    subtitle: "Users, roles & permissions",
    route: "/masters?tab=users",
  },
  {
    display: "Warehouses",
    subtitle: "Warehouse master configuration",
    route: "/masters?tab=warehouses",
  },
  {
    display: "Docks",
    subtitle: "Dock master & gate setup",
    route: "/masters?tab=docks",
  },
  {
    display: "Carriers",
    subtitle: "Carrier & transport partners",
    route: "/masters?tab=carriers",
  },
  {
    display: "Slotting Rules",
    subtitle: "Putaway & storage logic",
    route: "/masters?tab=slotting-rules",
  },
  {
    display: "Roles",
    subtitle: "Role definitions & mapping",
    route: "/masters?tab=roles",
  },
  {
    display: "Permissions",
    subtitle: "Access control policies",
    route: "/masters?tab=permissions",
  },
  {
    display: "Modules",
    subtitle: "System module configuration",
    route: "/masters?tab=modules",
  },
  {
    display: "Packing - Ready",
    subtitle: "Orders ready for packing",
    route: "/packing?tab=ready",
  },
  {
    display: "Packing - In Progress",
    subtitle: "Currently packing orders",
    route: "/packing?tab=progress",
  },
  {
    display: "Packing - Completed",
    subtitle: "Packed orders history",
    route: "/packing?tab=completed",
  },
  {
    display: "Picking Waves",
    subtitle: "Manage picking waves",
    route: "/picking?tab=waves",
  },
  {
    display: "Picking Tasks",
    subtitle: "Active pick tasks",
    route: "/picking?tab=tasks",
  },
  {
    display: "Picking Exceptions",
    subtitle: "Short picks & issues",
    route: "/picking?tab=exceptions",
  },
  {
    display: "Billable Events",
    subtitle: "All billable activities",
    route: "/billing?tab=billableEvents",
  },
  {
    display: "Ready to Invoice",
    subtitle: "Events ready for invoicing",
    route: "/billing?tab=readyToInvoice",
  },
  {
    display: "Invoiced",
    subtitle: "Generated invoices",
    route: "/billing?tab=invoiced",
  },
  {
    display: "Payments Aging",
    subtitle: "Outstanding payments report",
    route: "/billing?tab=paymentsAging",
  },
  {
    display: "Rate Cards",
    subtitle: "Client pricing configuration",
    route: "/billing?tab=rateCards",
  },
  {
    display: "Shipping - Ready to Ship",
    subtitle: "Packed orders pending dispatch",
    route: "/shipping?tab=readyToShip",
  },
  {
    display: "Shipping - In Transit",
    subtitle: "Track carrier shipments",
    route: "/shipping?tab=inTransit",
  },
  {
    display: "Shipping - Delivered",
    subtitle: "Delivered shipments & POD",
    route: "/shipping?tab=delivered",
  },
  {
    display: "Shipping - Exceptions",
    subtitle: "Delays, damage, RTO issues",
    route: "/shipping?tab=exceptions",
  },
];

// ─────────────────────────────────────────────
// 2. SEARCH REGISTRY
//    Each entry defines one searchable entity.
//    Add new entities here — zero controller changes needed.
// ─────────────────────────────────────────────
const SEARCH_REGISTRY = [
  {
    key: "asns",
    label: "ASN",
    model: ASN,
    idField: "asn_no", // exact-match field for ID queries
    searchFields: ["asn_no", "reference_no", "vehicle_no", "transporter_name"],
    displayField: "asn_no",
    subtitleField: "status",
    extraAttributes: ["eta", "status"],
    route: "/inbound/ASNDetails",
  },
  {
    key: "grns",
    label: "GRN",
    model: GRN,
    idField: "grn_no",
    searchFields: ["grn_no"],
    displayField: "grn_no",
    subtitleField: "status",
    extraAttributes: ["status", "posted_at"],
    route: "/inbound/grns",
  },
  {
    key: "putaway_tasks",
    label: "Putaway Task",
    model: GRNLine,
    idField: "pt_task_id",
    searchFields: ["pt_task_id"],
    displayField: "pt_task_id",
    subtitleField: "putaway_status",
    extraAttributes: ["putaway_status", "qty"],
    route: "/putaway/putawaydetails",
  },
  {
    key: "skus",
    label: "SKU",
    model: SKU,
    idField: "sku_code",
    searchFields: ["sku_code", "sku_name", "description", "category"],
    displayField: "sku_name",
    subtitleField: "sku_code",
    extraAttributes: ["sku_code", "category", "uom"],
    route: "/master/skus",
  },
  {
    key: "pallets",
    label: "Pallet",
    model: Pallet,
    idField: "pallet_id",
    searchFields: ["pallet_id"],
    displayField: "pallet_id",
    subtitleField: "status",
    extraAttributes: ["status", "pallet_type"],
    route: "/inbound/pallets",
  },
  {
    key: "clients",
    label: "Client",
    model: Client,
    idField: "client_code",
    searchFields: ["client_code", "client_name", "contact_person", "email"],
    displayField: "client_name",
    subtitleField: "client_code",
    extraAttributes: ["client_code", "email"],
    route: "/master?tab=clients",
    no_deeplink: true,
  },
  {
    key: "suppliers",
    label: "Supplier",
    model: Supplier,
    idField: "supplier_code",
    searchFields: ["supplier_code", "supplier_name", "contact_person", "email"],
    displayField: "supplier_name",
    subtitleField: "supplier_code",
    extraAttributes: ["supplier_code", "email"],
    route: "/master/suppliers",
  },
  {
    key: "locations",
    label: "Location",
    model: Location,
    idField: "location_code",
    searchFields: ["location_code", "zone", "aisle"],
    displayField: "location_code",
    subtitleField: "zone",
    extraAttributes: ["zone", "location_type", "current_usage", "capacity"],
    route: "/master/locations",
  },
  {
    key: "orders",
    label: "Sales Order",
    model: SalesOrder,
    idField: "order_no",
    searchFields: ["order_no", "customer_name", "status"],
    displayField: "order_no",
    subtitleField: "status",
    extraAttributes: ["customer_name", "status"],
    route: "/outbound/sales-orders",
  },
];

// ─────────────────────────────────────────────
// 3. SMART PREFIX MAP
//    Maps ID prefixes → which registry keys to search.
//    When a user types "ASN-00012", we ONLY query the asns table.
//    When a user types "GRN-00005", we ONLY query the grns table.
//    Saves unnecessary DB queries on every ID lookup.
// ─────────────────────────────────────────────
const PREFIX_MAP = {
  ASN: ["asns"],
  GRN: ["grns"],
  PT: ["putaway_tasks"], // Putaway Task IDs live in grn_lines
  SO: ["orders"], // Sales Orders (add to registry when built)
  PW: ["waves"], // Pick Waves (add to registry when built)
  PL: ["pick_lists"],
  SHP: ["shipments"],
  INV: ["invoices"],
  P: ["pallets"], // Pallet IDs e.g. P-00001
};

// Regex: matches structured IDs like ASN-00001, GRN-00012, P-00099
const STRUCTURED_ID_REGEX = /^([A-Z]+)-(\d+)$/i;

// ─────────────────────────────────────────────
// 4. HELPERS
// ─────────────────────────────────────────────

/**
 * Given a search query, determines which registry entries to search.
 * If the query looks like a structured ID (e.g. "ASN-00012"), only
 * the mapped entity type(s) are searched. Otherwise all are searched.
 * Returns: { filteredRegistry, isIdQuery, detectedPrefix }
 */
const resolveSearchScope = (query, requestedTypes) => {
  let registry = requestedTypes
    ? SEARCH_REGISTRY.filter((r) => requestedTypes.split(",").includes(r.key))
    : SEARCH_REGISTRY;

  const prefixMatch = query.match(STRUCTURED_ID_REGEX);

  if (prefixMatch) {
    const prefix = prefixMatch[1].toUpperCase();
    const mappedKeys = PREFIX_MAP[prefix];

    if (mappedKeys) {
      // Narrow registry to only the relevant entity type(s)
      const narrowed = registry.filter((r) => mappedKeys.includes(r.key));
      // Only narrow if we actually found matching registry entries
      if (narrowed.length > 0) {
        return {
          filteredRegistry: narrowed,
          isIdQuery: true,
          detectedPrefix: prefix,
        };
      }
    }
  }

  return { filteredRegistry: registry, isIdQuery: false, detectedPrefix: null };
};

/**
 * Builds the Sequelize WHERE clause for one registry entry.
 * ID queries use exact match. Text queries use LIKE on all searchFields.
 */
const buildWhereClause = (config, query, isIdQuery) => {
  if (isIdQuery) {
    return { [config.idField]: { [Op.eq]: query.toUpperCase() } };
  }

  return {
    [Op.or]: config.searchFields.map((field) => ({
      [field]: { [Op.like]: `%${query}%` },
    })),
  };
};

/**
 * Searches static NAV_ITEMS array — no DB involved.
 * Returns items whose display or subtitle contains the query.
 */
const searchNavigation = (query) => {
  const lower = query.toLowerCase();
  const matched = NAV_ITEMS.filter(
    (item) =>
      item.display.toLowerCase().includes(lower) ||
      item.subtitle.toLowerCase().includes(lower),
  ).slice(0, 5);

  if (matched.length === 0) return null;

  return {
    key: "navigation",
    label: "Go to",
    route: null,
    items: matched.map((item) => ({
      id: null,
      display: item.display,
      subtitle: item.subtitle,
      entityId: null,
      route: item.route, // each nav item has its own route
      type: "navigation",
    })),
  };
};

// ─────────────────────────────────────────────
// 5. MAIN CONTROLLER
// ─────────────────────────────────────────────

/**
 * GET /api/search?q=ASN-00012
 * GET /api/search?q=wireless+mouse&types=skus,clients
 * GET /api/search?q=putaway&limit=3
 *
 * Query params:
 *   q       {string}  — search term (min 2 chars)
 *   types   {string}  — comma-separated entity keys to restrict search (optional)
 *   limit   {number}  — max results per entity (default 5)
 */
export const globalSearch = async (req, res, next) => {
  try {
    const { q, types, limit = 5 } = req.query;

    // ── Validate ──────────────────────────────
    if (!q || q.trim().length < 2) {
      return res.json({ query: q || "", results: {}, meta: { total: 0 } });
    }

    const query = q.trim();
    const perEntityLimit = Math.min(parseInt(limit) || 5, 20); // cap at 20

    // ── Resolve scope (smart ID detection) ────
    const { filteredRegistry, isIdQuery, detectedPrefix } = resolveSearchScope(
      query,
      types,
    );

    // ── Run all DB searches in parallel ───────
    const dbSearches = filteredRegistry.map(async (config) => {
      try {
        const whereClause = buildWhereClause(config, query, isIdQuery);

        // Build attribute list — always include id, displayField, subtitleField, idField
        const attributes = [
          "id",
          config.idField,
          config.displayField,
          ...(config.subtitleField ? [config.subtitleField] : []),
          ...(config.extraAttributes || []),
        ].filter((v, i, arr) => arr.indexOf(v) === i); // dedupe

        const rows = await config.model.findAll({
          where: whereClause,
          limit: perEntityLimit,
          attributes,
          raw: true,
        });

        if (rows.length === 0) return null;

        return {
          key: config.key,
          label: config.label,
          route: config.route,
          items: rows.map((row) => ({
            id: row.id,
            display: row[config.displayField],
            subtitle: row[config.subtitleField] || null,
            entityId: row[config.idField],
            route: config.no_deeplink
              ? config.route
              : `${config.route}/${row.id}`, // deep link to the specific record
            type: config.key,
            meta: (config.extraAttributes || []).reduce((acc, attr) => {
              acc[attr] = row[attr];
              return acc;
            }, {}),
          })),
        };
      } catch (err) {
        // One entity failing shouldn't kill the whole search
        console.error(`[Search] Failed to query ${config.key}:`, err.message);
        return null;
      }
    });

    // ── Navigation search (sync, no DB) ───────
    const navResult = searchNavigation(query);

    // ── Await all DB searches ──────────────────
    const settled = await Promise.allSettled(dbSearches);

    // ── Assemble final results ─────────────────
    const results = {};
    let total = 0;

    // Navigation comes first in results
    if (navResult) {
      results["navigation"] = navResult;
      total += navResult.items.length;
    }

    settled.forEach((outcome) => {
      if (outcome.status === "fulfilled" && outcome.value !== null) {
        const group = outcome.value;
        results[group.key] = group;
        total += group.items.length;
      }
    });

    // ── Respond ───────────────────────────────
    return res.json({
      query,
      results,
      meta: {
        total,
        isIdQuery,
        detectedPrefix,
        searchedEntities: filteredRegistry.map((r) => r.key),
      },
    });
  } catch (err) {
    next(err);
  }
};
