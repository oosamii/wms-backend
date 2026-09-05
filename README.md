# WMS Backend API

A comprehensive Warehouse Management System (WMS) REST API built with Node.js, Express, and Sequelize ORM backed by MySQL. It covers the full warehouse lifecycle — inbound receiving, inventory management, outbound fulfilment, and billing.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Authentication & Authorization](#authentication--authorization)
- [API Reference](#api-reference)
  - [Health Check](#health-check)
  - [Authentication](#authentication)
  - [Users](#users)
  - [Roles](#roles)
  - [Modules](#modules)
  - [Permissions](#permissions)
  - [User-Role Assignments](#user-role-assignments)
  - [Warehouses](#warehouses)
  - [Clients](#clients)
  - [Suppliers](#suppliers)
  - [Docks](#docks)
  - [SKUs](#skus)
  - [Locations](#locations)
  - [Pallets](#pallets)
  - [ASNs (Advance Shipping Notices)](#asns-advance-shipping-notices)
  - [ASN Lines](#asn-lines)
  - [GRNs (Goods Receipt Notes)](#grns-goods-receipt-notes)
  - [GRN Lines](#grn-lines)
  - [Inventory](#inventory)
  - [Inventory Holds](#inventory-holds)
  - [Sales Orders](#sales-orders)
  - [Sales Order Lines](#sales-order-lines)
  - [Stock Allocations](#stock-allocations)
  - [Pick Waves](#pick-waves)
  - [Pick Tasks](#pick-tasks)
  - [Packing](#packing)
  - [Shipping](#shipping)
  - [Carriers](#carriers)
  - [Rate Cards](#rate-cards)
  - [Billable Events](#billable-events)
  - [Billing](#billing)
  - [Invoices](#invoices)
  - [Payments](#payments)
- [Workflows](#workflows)
- [Security](#security)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (ES6 Modules) |
| Framework | Express.js v5 |
| ORM | Sequelize v6 |
| Database | MySQL (mysql2) |
| Authentication | JWT (jsonwebtoken) |
| Password Hashing | bcrypt |
| Security | helmet, CORS, express-rate-limit |
| Logging | morgan |
| Dev Tools | nodemon, dotenv |

---

## Project Structure

```
wms-backend/
├── src/
│   ├── config/
│   │   └── database.js           # Sequelize / MySQL connection config
│   ├── middleware/
│   │   ├── auth.js               # JWT authentication & RBAC authorization
│   │   └── errorHandler.js       # Global error handler & 404 handler
│   ├── models/                   # 35+ Sequelize models with associations
│   ├── controllers/              # Business logic for each domain
│   ├── routes/                   # Express route modules (index.js mounts all)
│   ├── services/                 # Service-layer helpers
│   ├── utils/                    # Shared utility functions
│   ├── seeders/                  # Database seed scripts
│   └── server.js                 # App bootstrap & middleware setup
├── docs/                         # Additional documentation
├── package.json
└── .env                          # Environment configuration
```

---

## Getting Started

### Prerequisites

- Node.js >= 18
- MySQL >= 8

### Installation

```bash
git clone <repo-url>
cd wms-backend
npm install
```

### Database Setup

```bash
# Run migrations
npm run db:migrate

# Seed initial data (roles, permissions, modules, etc.)
npm run db:seed
```

### Running the Server

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

The server starts on `http://localhost:3000` by default.

---

## Environment Variables

Create a `.env` file in the project root:

```env
# Server
NODE_ENV=development
PORT=3000
DOMAIN=localhost

# Database
DB_HOST=localhost
DB_PORT=3306
DB_NAME=wms
DB_USER=wms_user
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your_super_secret_jwt_key
JWT_EXPIRES_IN=24h

# Logging
LOG_LEVEL=debug

# SSL (production only)
# SSL_KEY_PATH=/etc/letsencrypt/live/yourdomain.com/privkey.pem
# SSL_CERT_PATH=/etc/letsencrypt/live/yourdomain.com/fullchain.pem
```

---

## Authentication & Authorization

### Authentication

All protected endpoints require a JWT bearer token in the `Authorization` header:

```
Authorization: Bearer <token>
```

Obtain a token via `POST /api/auth/login`.

### Role-Based Access Control (RBAC)

The system uses a three-tier RBAC model:

- **Users** are assigned one or more **Roles**
- **Roles** are granted access to **Modules** (e.g. `INBOUND`, `INVENTORY`, `BILLING`)
- Each module grant specifies a **Permission** level: `READ`, `CREATE`, `UPDATE`, or `DELETE`

Module codes used in route guards:

| Module Code | Description |
|---|---|
| `WAREHOUSE` | Warehouses, locations, docks |
| `INVENTORY` | SKUs, inventory records |
| `INBOUND` | ASNs, ASN lines, receiving |
| `GRN` | Goods receipt and putaway |
| `ORDERS` | Sales orders, packing |
| `OUTBOUND` | Pick waves, pick tasks |
| `SHIPPINGS` | Shipments |
| `CARRIERS` | Carrier management |
| `BILLING` | Rate cards, invoices, payments |
| `SUPPLIERS` | Supplier management |
| `USER_MANAGEMENT` | Users, clients |

---

## API Reference

**Base URL:** `http://localhost:3000/api`

**Rate Limit:** 500 requests per 15 minutes per IP on all `/api/*` routes.

---

### Health Check

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | No | Server health check |

---

### Authentication

**Base path:** `/api/auth`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/register` | No | Register a new user |
| `POST` | `/auth/login` | No | Login and receive JWT token |
| `GET` | `/auth/profile` | Yes | Get authenticated user's profile |

**Login request body:**
```json
{
  "email": "user@example.com",
  "password": "yourpassword"
}
```

**Login response:**
```json
{
  "token": "<jwt>",
  "user": { "id": 1, "email": "...", "roles": [...] }
}
```

---

### Users

**Base path:** `/api/users` | Module: `USER_MANAGEMENT`

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `GET` | `/users` | READ | List all users |
| `GET` | `/users/:id` | READ | Get user by ID |
| `POST` | `/users` | CREATE | Create a new user |
| `PUT` | `/users/:id` | UPDATE | Update user details |
| `PUT` | `/users/:id/password` | UPDATE | Change user password |
| `DELETE` | `/users/:id` | DELETE | Delete user |

---

### Roles

**Base path:** `/api/roles` | Admin-only for write operations

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/roles` | USER_MANAGEMENT READ | List all roles |
| `GET` | `/roles/:id` | USER_MANAGEMENT READ | Get role with permissions |
| `POST` | `/roles` | ADMIN | Create a new role |
| `PUT` | `/roles/:id` | ADMIN | Update role |
| `DELETE` | `/roles/:id` | ADMIN | Delete role |
| `POST` | `/roles/permissions` | ADMIN | Assign permission to a role |
| `DELETE` | `/roles/permissions` | ADMIN | Remove permission from a role |

---

### Modules

**Base path:** `/api/modules` | Admin-only for write operations

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/modules` | Yes | List all modules |
| `GET` | `/modules/:id` | Yes | Get module by ID |
| `POST` | `/modules` | ADMIN | Create module |
| `PUT` | `/modules/:id` | ADMIN | Update module |
| `DELETE` | `/modules/:id` | ADMIN | Delete module |

---

### Permissions

**Base path:** `/api/permissions` | Admin-only for write operations

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/permissions` | Yes | List all permissions |
| `GET` | `/permissions/:id` | Yes | Get permission by ID |
| `POST` | `/permissions` | ADMIN | Create permission |
| `PUT` | `/permissions/:id` | ADMIN | Update permission |
| `DELETE` | `/permissions/:id` | ADMIN | Delete permission |

---

### User-Role Assignments

**Base path:** `/api/user-roles` | Admin-only for write operations

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/user-roles` | ADMIN | List all user-role assignments |
| `GET` | `/user-roles/user/:userId` | Yes | Get roles assigned to a user |
| `GET` | `/user-roles/role/:roleId` | Yes | Get users with a specific role |
| `POST` | `/user-roles` | ADMIN | Assign role to user |
| `POST` | `/user-roles/bulk` | ADMIN | Bulk assign roles to user |
| `DELETE` | `/user-roles` | ADMIN | Remove role from user |

---

### Warehouses

**Base path:** `/api/warehouses` | Module: `WAREHOUSE`

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `GET` | `/warehouses` | READ | List all warehouses |
| `GET` | `/warehouses/:id` | READ | Get warehouse by ID |
| `POST` | `/warehouses` | CREATE | Create warehouse |
| `PUT` | `/warehouses/:id` | UPDATE | Update warehouse |
| `DELETE` | `/warehouses/:id` | DELETE | Delete warehouse |

---

### Clients

**Base path:** `/api/clients` | Module: `USER_MANAGEMENT`

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `GET` | `/clients` | READ | List all clients |
| `GET` | `/clients/:id` | READ | Get client by ID |
| `POST` | `/clients` | CREATE | Create client |
| `PUT` | `/clients/:id` | UPDATE | Update client |
| `DELETE` | `/clients/:id` | DELETE | Delete client |

---

### Suppliers

**Base path:** `/api/suppliers` | Module: `SUPPLIERS`

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `GET` | `/suppliers` | READ | List all suppliers |
| `GET` | `/suppliers/:id` | READ | Get supplier by ID |
| `POST` | `/suppliers` | CREATE | Create supplier |
| `PUT` | `/suppliers/:id` | UPDATE | Update supplier |
| `DELETE` | `/suppliers/:id` | DELETE | Delete supplier |

---

### Docks

**Base path:** `/api/docks` | Module: `WAREHOUSE`

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `GET` | `/docks` | READ | List all docks |
| `GET` | `/docks/:id` | READ | Get dock by ID |
| `POST` | `/docks` | CREATE | Create dock |
| `PUT` | `/docks/:id` | UPDATE | Update dock |
| `DELETE` | `/docks/:id` | DELETE | Delete dock |

---

### SKUs

**Base path:** `/api/skus` | Module: `INVENTORY`

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `GET` | `/skus` | READ | List all SKUs (supports pagination & filtering) |
| `GET` | `/skus/:id` | READ | Get SKU by ID |
| `POST` | `/skus` | CREATE | Create SKU |
| `PUT` | `/skus/:id` | UPDATE | Update SKU |
| `DELETE` | `/skus/:id` | DELETE | Delete SKU |

---

### Locations

**Base path:** `/api/locations` | Module: `WAREHOUSE`

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `GET` | `/locations` | READ | List locations (supports zone/type filters) |
| `GET` | `/locations/stats` | READ | Location capacity statistics |
| `GET` | `/locations/by-zone` | READ | Locations grouped by zone |
| `GET` | `/locations/:id` | READ | Get location by ID |
| `POST` | `/locations` | CREATE | Create a location |
| `POST` | `/locations/bulk` | CREATE | Bulk create locations |
| `PUT` | `/locations/:id` | UPDATE | Update location |
| `DELETE` | `/locations/:id` | DELETE | Delete location |

---

### Pallets

**Base path:** `/api/pallets` | Module: `PALLET`

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `GET` | `/pallets` | READ | List all pallets |
| `GET` | `/pallets/:id` | READ | Get pallet by ID |
| `POST` | `/pallets` | CREATE | Create pallet |
| `PUT` | `/pallets/:id` | UPDATE | Update pallet location |
| `DELETE` | `/pallets/:id` | DELETE | Delete pallet |

---

### ASNs (Advance Shipping Notices)

**Base path:** `/api/asns` | Module: `INBOUND`

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `GET` | `/asns/stats` | READ | ASN statistics dashboard |
| `GET` | `/asns` | READ | List all ASNs |
| `GET` | `/asns/:id` | READ | Get ASN by ID |
| `POST` | `/asns` | CREATE | Create ASN |
| `PUT` | `/asns/:id` | UPDATE | Update ASN |
| `POST` | `/asns/:id/confirm` | UPDATE | Confirm ASN |
| `POST` | `/asns/:id/start-receiving` | UPDATE | Begin receiving goods |
| `DELETE` | `/asns/:id` | DELETE | Cancel ASN |

**ASN Status Flow:** `DRAFT` → `CONFIRMED` → `RECEIVING` → `RECEIVED`

---

### ASN Lines

**Base path:** `/api/asn-lines` | Module: `INBOUND`

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `GET` | `/asn-lines/asn/:asnId` | READ | Get all lines for an ASN |
| `GET` | `/asn-lines/:lineId/pallets` | READ | Get pallets for a line |
| `POST` | `/asn-lines` | CREATE | Add a line to an ASN |
| `PUT` | `/asn-lines/:id` | UPDATE | Update ASN line |
| `POST` | `/asn-lines/:lineId/receive` | UPDATE | Receive items for a line |
| `DELETE` | `/asn-lines/:id` | DELETE | Delete ASN line |

---

### GRNs (Goods Receipt Notes)

**Base path:** `/api/grns` | Module: `GRN`

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `GET` | `/grns` | READ | List all GRNs |
| `GET` | `/grns/:id` | READ | Get GRN by ID |
| `POST` | `/grns/post-from-asn` | CREATE | Create GRN from a received ASN |
| `POST` | `/grns/assign-putaway` | UPDATE | Assign putaway task to user |
| `POST` | `/grns/:lineId/complete-putaway` | UPDATE | Mark putaway as complete |

---

### GRN Lines

**Base path:** `/api/grn-lines` | Module: `WAREHOUSE`

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `GET` | `/grn-lines` | READ | List all GRN lines |
| `GET` | `/grn-lines/:id` | READ | Get GRN line by ID |
| `GET` | `/grn-lines/:id/suggest-location` | READ | Get suggested putaway location |
| `PUT` | `/grn-lines/:id` | UPDATE | Update GRN line |
| `PUT` | `/grn-lines/bulk/update` | UPDATE | Bulk update GRN lines |
| `POST` | `/grn-lines/start-putaway/:lineId` | UPDATE | Start putaway for a line |

---

### Inventory

**Base path:** `/api/inventory` | Requires authentication

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/inventory/summary` | Inventory dashboard summary |
| `GET` | `/inventory/group-by-sku` | Inventory grouped by SKU |
| `GET` | `/inventory/group-by-zone` | Inventory grouped by zone |
| `GET` | `/inventory/transactions` | Inventory transaction history |
| `GET` | `/inventory/sku/:sku_id` | Inventory records for a SKU |
| `GET` | `/inventory/location/:location_id` | Inventory at a specific location |
| `GET` | `/inventory` | List all inventory records (filterable) |
| `GET` | `/inventory/:id` | Get single inventory record |
| `POST` | `/inventory/adjust` | Stock adjustment |
| `POST` | `/inventory/transfer` | Stock transfer between locations |

---

### Inventory Holds

**Base path:** `/api/inventory-holds` | Requires authentication

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/inventory-holds/stats` | Hold statistics |
| `GET` | `/inventory-holds` | List all holds (filterable) |
| `GET` | `/inventory-holds/:id` | Get hold by ID |
| `POST` | `/inventory-holds` | Create inventory hold |
| `POST` | `/inventory-holds/:id/release` | Release a hold |
| `PUT` | `/inventory-holds/:id` | Update hold details |
| `DELETE` | `/inventory-holds/:id` | Delete hold |

---

### Sales Orders

**Base path:** `/api/sales-orders` | Requires authentication

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/sales-orders/stats` | Order statistics |
| `GET` | `/sales-orders/outbound-summary` | Outbound operations summary |
| `GET` | `/sales-orders` | List all sales orders |
| `GET` | `/sales-orders/:id` | Get sales order by ID |
| `POST` | `/sales-orders` | Create sales order |
| `PUT` | `/sales-orders/:id` | Update sales order |
| `POST` | `/sales-orders/:id/confirm` | Confirm order (triggers auto stock allocation) |
| `DELETE` | `/sales-orders/:id/cancel` | Cancel sales order |

**Order Status Flow:** `DRAFT` → `CONFIRMED` → `ALLOCATED` → `PICKING` → `PACKED` → `SHIPPED`

---

### Sales Order Lines

**Base path:** `/api/sales-order-lines` | Requires authentication

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/sales-order-lines/order/:orderId` | Get lines for an order |
| `GET` | `/sales-order-lines/:id` | Get order line by ID |
| `POST` | `/sales-order-lines` | Add line to order |
| `PUT` | `/sales-order-lines/:id` | Update order line |
| `DELETE` | `/sales-order-lines/:id` | Delete order line |

---

### Stock Allocations

**Base path:** `/api/stock-allocations` | Requires authentication

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/stock-allocations/stats` | Allocation statistics |
| `GET` | `/stock-allocations` | List all allocations |
| `GET` | `/stock-allocations/order/:orderId` | Get allocations for an order |
| `GET` | `/stock-allocations/:id` | Get allocation by ID |
| `POST` | `/stock-allocations/allocate` | Manually allocate stock |
| `POST` | `/stock-allocations/:id/release` | Release a single allocation |
| `POST` | `/stock-allocations/order/:orderId/release-all` | Release all allocations for an order |

---

### Pick Waves

**Base path:** `/api/pick-waves` | Requires authentication

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/pick-waves/stats` | Wave statistics |
| `GET` | `/pick-waves/eligible-orders` | Orders eligible for wave planning |
| `GET` | `/pick-waves` | List all pick waves |
| `GET` | `/pick-waves/:id` | Get pick wave by ID |
| `POST` | `/pick-waves` | Create pick wave |
| `POST` | `/pick-waves/:id/release` | Release wave (generates pick tasks) |
| `POST` | `/pick-waves/:id/cancel` | Cancel pick wave |

---

### Pick Tasks

**Base path:** `/api/pick-tasks` | Requires authentication

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/pick-tasks/my-tasks` | Get tasks assigned to current user |
| `GET` | `/pick-tasks/wave/:waveId` | Get all tasks for a wave |
| `GET` | `/pick-tasks` | List all pick tasks |
| `GET` | `/pick-tasks/:id` | Get pick task by ID |
| `POST` | `/pick-tasks/assign` | Manager assigns tasks to picker |
| `POST` | `/pick-tasks/self-assign` | Picker self-assigns a task |
| `POST` | `/pick-tasks/:id/start` | Start picking |
| `POST` | `/pick-tasks/:id/complete` | Complete picking (handles full & short picks) |

---

### Packing

**Base path:** `/api/packing` | Module: `ORDERS`

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `GET` | `/packing/:orderId/cartons` | READ | Get cartons for an order |
| `POST` | `/packing/:orderId/start` | UPDATE | Start packing for an order |
| `POST` | `/packing/:orderId/cartons` | UPDATE | Create a new carton |
| `POST` | `/packing/:orderId/cartons/:cartonId/items` | UPDATE | Add item to carton |
| `PUT` | `/packing/:orderId/cartons/:cartonId/close` | UPDATE | Close a carton |
| `POST` | `/packing/:orderId/finalize` | UPDATE | Finalize packing for an order |
| `DELETE` | `/packing/:orderId/cartons/:cartonId/items/:itemId` | DELETE | Remove item from carton |
| `DELETE` | `/packing/:orderId/cartons/:cartonId` | DELETE | Delete carton |

---

### Shipping

**Base path:** `/api/shipping` | Module: `SHIPPINGS`

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `GET` | `/shipping` | READ | List all shipments |
| `GET` | `/shipping/:shipmentId` | READ | Get shipment details |
| `POST` | `/shipping/:orderId/create` | UPDATE | Create shipment for an order |
| `POST` | `/shipping/:shipmentId/dispatch` | UPDATE | Dispatch shipment |

---

### Carriers

**Base path:** `/api/carriers` | Module: `CARRIERS`

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `GET` | `/carriers` | READ | List all carriers |
| `GET` | `/carriers/:id` | READ | Get carrier by ID |
| `POST` | `/carriers` | CREATE | Create carrier |
| `PUT` | `/carriers/:id` | UPDATE | Update carrier |
| `DELETE` | `/carriers/:id` | DELETE | Delete carrier |

---

### Rate Cards

**Base path:** `/api/rate-cards` | Module: `BILLING`

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `GET` | `/rate-cards` | READ | List all rate cards |
| `GET` | `/rate-cards/:id` | READ | Get rate card by ID |
| `POST` | `/rate-cards` | CREATE | Create rate card |
| `PUT` | `/rate-cards/:id` | UPDATE | Update rate card |
| `DELETE` | `/rate-cards/:id` | DELETE | Delete rate card |

---

### Billable Events

**Base path:** `/api/billable-events` | Module: `BILLING`

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `GET` | `/billable-events/summary` | READ | Billable events summary |
| `GET` | `/billable-events` | READ | List all billable events |
| `GET` | `/billable-events/:id` | READ | Get billable event by ID |
| `POST` | `/billable-events/manual` | CREATE | Create manual billable event |
| `PUT` | `/billable-events/:id` | UPDATE | Update billable event |
| `POST` | `/billable-events/:id/void` | UPDATE | Void a billable event |

---

### Billing

**Base path:** `/api/billing` | Module: `BILLING`

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `GET` | `/billing/ready-to-invoice` | READ | Get billable events ready for invoicing |
| `POST` | `/billing/preview` | READ | Preview billing before running |
| `POST` | `/billing/run` | CREATE | Run billing cycle and generate invoices |

---

### Invoices

**Base path:** `/api/invoices` | Module: `BILLING`

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `GET` | `/invoices` | READ | List all invoices |
| `GET` | `/invoices/:id` | READ | Get invoice by ID |
| `POST` | `/invoices` | CREATE | Create invoice |
| `PUT` | `/invoices/:id` | UPDATE | Update invoice |
| `POST` | `/invoices/:id/send` | UPDATE | Send invoice to client |
| `POST` | `/invoices/:id/void` | UPDATE | Void invoice |

---

### Payments

**Base path:** `/api/payments` | Module: `BILLING`

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `GET` | `/payments/aging` | READ | Accounts receivable aging report |
| `GET` | `/payments` | READ | List all payments |
| `GET` | `/payments/:id` | READ | Get payment by ID |
| `POST` | `/payments` | CREATE | Record a payment |
| `POST` | `/payments/:id/confirm` | UPDATE | Confirm payment |
| `POST` | `/payments/:id/reverse` | UPDATE | Reverse payment |

---

## Workflows

### Inbound Flow

```
Create ASN → Confirm ASN → Start Receiving → Receive ASN Lines
    → Post GRN from ASN → Assign Putaway → Complete Putaway → Inventory Updated
```

### Outbound Flow

```
Create Sales Order → Confirm Order (auto-allocates stock)
    → Create Pick Wave → Release Wave (generates Pick Tasks)
    → Assign / Self-assign Tasks → Start Pick → Complete Pick
    → Start Packing → Create Cartons → Add Items → Close Cartons → Finalize Packing
    → Create Shipment → Dispatch
```

### Billing Flow

```
Billable Events generated (inbound/outbound activity)
    → Configure Rate Cards → Run Billing Cycle
    → Generate Invoices → Send to Client → Record Payment → Confirm Payment
```

---

## Security

| Mechanism | Details |
|---|---|
| Authentication | JWT bearer tokens (24h expiry by default) |
| Password Storage | bcrypt hashing |
| Access Control | RBAC — module + permission level checks on every route |
| Security Headers | helmet middleware |
| CORS | Configurable via cors middleware |
| Rate Limiting | 500 requests / 15 minutes per IP on `/api/*` |
| SQL Injection | Prevented by Sequelize parameterized queries |
| Error Responses | Stack traces suppressed in production |

<!-- Security scan triggered at 2026-09-05 07:28:59 -->