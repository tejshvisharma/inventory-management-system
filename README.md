# Inventory & Order Management API

A production-grade RESTful API for user authentication, product catalog management, and transactional order processing. Built with **Node.js**, **Express 5**, and **MongoDB (Mongoose)**, featuring ACID transactions, atomic inventory updates, anti-overselling guards, idempotency key guarantees, and role-based access control.

---

## Table of Contents

- [Core Architectural Features](#core-architectural-features)
  - [Atomic Inventory & Anti-Overselling](#1-atomic-inventory--anti-overselling)
  - [ACID Transactions with Mongoose](#2-acid-transactions-with-mongoose)
  - [Idempotent Order Creation](#3-idempotent-order-creation)
  - [Server-Side Pricing & Historical Snapshots](#4-server-side-pricing--historical-snapshots)
  - [IDOR Protection & Ownership Enforcement](#5-idor-protection--ownership-enforcement)
- [Order Processing Workflow](#order-processing-workflow)
- [Tech Stack](#tech-stack)
- [Prerequisites & Requirements](#prerequisites--requirements)
- [Getting Started](#getting-started)
  - [Installation](#installation)
  - [Environment Configuration](#environment-configuration)
  - [Running the Application](#running-the-application)
- [Project Layout](#project-layout)
- [Authentication & Roles](#authentication--roles)
- [API Reference](#api-reference)
  - [Standard Envelopes](#standard-envelopes)
  - [Health](#health)
  - [User & Auth Routes](#user--auth-routes)
  - [Product Catalog Routes](#product-catalog-routes)
  - [Order Routes](#order-routes)
- [Testing & Concurrency Verification](#testing--concurrency-verification)
- [Security Best Practices](#security-best-practices)
- [Database Schema (ERD & Data Dictionary)](./DATABASE_SCHEMA.md)

---

## Core Architectural Features

### 1. Atomic Inventory & Anti-Overselling
To eliminate race conditions when multiple users attempt to purchase scarce inventory concurrently, the system avoids naïve "read-then-write" stock decrements. Instead, it executes an atomic condition inside the database engine:

```javascript
const updated = await Product.findOneAndUpdate(
  { _id: productId, stock: { $gte: quantity } }, // Filter: stock must be sufficient
  { $inc: { stock: -quantity } },                 // Update: decrement atomically
  { new: true, session }
);
```

- If `updated` is `null`, the system determines whether the product does not exist (`404 Not Found`) or has insufficient inventory (`409 Conflict`).
- Inventory cannot drop below zero, preventing overselling under heavy concurrency.

### 2. ACID Transactions with Mongoose
All state changes during order creation occur within a MongoDB multi-document transaction (`session.startTransaction()`):
1. Decrement product stocks.
2. Generate the order document.
3. Persist individual order line items.
4. Record the idempotency key.

If any operation fails (e.g. stock depletion on item 3 of 5), `session.abortTransaction()` automatically rolls back all preceding writes.

### 3. Idempotent Order Creation
Network retries and accidental double submissions are protected by an `Idempotency-Key` header:
- **Pre-check:** If a request with the same `(key, userId)` already succeeded, the cached response is immediately returned without touching inventory or creating duplicate orders.
- **Race condition guard:** A compound unique index `{ key: 1, userId: 1 }` prevents concurrent requests from creating conflicting duplicate orders. If a concurrent duplicate hits the unique constraint (MongoDB error code `11000`), the transaction rolls back and safely replays the winning response.
- **Auto-cleanup:** A TTL index automatically expires and removes idempotency keys after 24 hours.

### 4. Server-Side Pricing & Historical Snapshots
- Clients **never** provide pricing. Any client-sent `price` field is rejected by validators (`422 Unprocessable Entity`).
- Current prices are retrieved directly from the verified `Product` document.
- The purchased price is snapshotted into `OrderItem.priceAtPurchase`. Subsequent catalog price modifications do not mutate historical order totals.

### 5. IDOR Protection & Ownership Enforcement
Order queries strictly bind the requested resource ID with the authenticated user ID at the database level:

```javascript
const order = await Order.findOne({
  _id: orderId,
  user: req.user._id,
});
```

A user querying an order ID that belongs to another customer receives `404 Not Found` (identical to a non-existent order), preventing resource enumeration and IDOR attacks.

---

## Order Processing Workflow

```text
POST /api/v1/orders
       │
       ▼
[1] Authenticate User (JWT verification via Cookie or Bearer token)
       │
       ▼
[2] Validate Request Body (non-empty items, valid ObjectIds, integer qty, no client price)
       │
       ▼
[3] Validate & Check Idempotency-Key
       ├─ If key exists for user ──► Return cached 201 response immediately (Replay)
       └─ If new key ──────────────► Proceed
       │
       ▼
[4] Normalize Order Items (merge duplicate productIds by summing quantities)
       │
       ▼
[5] Start MongoDB Session & Transaction
       │
       ├─► For each product: Atomic decrement { _id, stock: { $gte: quantity } }
       │   └─ If insufficient stock ──► Abort transaction & Return 409 Conflict
       │
       ├─► Compute totalAmount server-side (Σ databasePrice × quantity)
       │
       ├─► Pre-allocate Order _id to link Order & OrderItems
       │
       ├─► Create OrderItems with priceAtPurchase snapshots
       │
       ├─► Create Order document
       │
       ├─► Store IdempotencyKey record inside transaction
       │
       └─► Commit Transaction
       │
       ▼
[6] Return 201 Created with full order details
```

---

## Tech Stack

- **Runtime:** Node.js (ES Modules, `type: "module"`)
- **Web Framework:** Express 5
- **Database & ODM:** MongoDB, Mongoose 9
- **Authentication & Security:** JSON Web Tokens (`jsonwebtoken`), `bcrypt`, `helmet`, `cors`, `cookie-parser`
- **Validation:** `express-validator`
- **Testing:** Jest, Supertest

---

## Prerequisites & Requirements

- **Node.js:** v18.0.0 or higher
- **MongoDB:** v6.0+ configured as a **Replica Set** (required for multi-document ACID transactions).

> **Note on MongoDB Replica Sets:**  
> MongoDB multi-document transactions require a replica set even in local development. If running standalone locally, start MongoDB with `--replSet rs0` and run `rs.initiate()` in `mongosh`, or use a MongoDB Atlas cluster or Docker replica set.

---

## Getting Started

### Installation

Clone the repository and install dependencies:

```bash
git clone <repository-url>
cd inventory-order-api
npm install
```

### Environment Configuration

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Configure your environment variables:

```env
PORT=8000
MONGO_URI=mongodb://localhost:27017/inventory-order-api?replicaSet=rs0
JWT_SECRET=your_super_secret_jwt_key_here
NODE_ENV=development
MONGO_RETRY_DELAY_MS=5000
```

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP server port | `8000` |
| `MONGO_URI` | MongoDB connection URI with replica set | — |
| `JWT_SECRET` | Secret key for signing and verifying JWT tokens | — |
| `NODE_ENV` | Application environment (`development` / `production`) | `development` |
| `MONGO_RETRY_DELAY_MS` | Reconnect retry interval in milliseconds | `5000` |

### Running the Application

**Development mode (with nodemon reload):**
```bash
npm run dev
```

**Running Tests:**
```bash
npm test
```

---

## Project Layout

```text
inventory-order-api/
├── src/
│   ├── controllers/            # Route handlers & business logic
│   │   ├── health.controller.js
│   │   ├── order.controller.js
│   │   ├── product.controller.js
│   │   └── user.controller.js
│   ├── db/
│   │   └── db.js               # MongoDB connection with automatic retry loop
│   ├── middleware/             # Express middlewares
│   │   ├── auth.middleware.js   # JWT authentication & req.user attachment
│   │   ├── errorHandler.middleware.js # Centralized error formatting
│   │   ├── logger.middleware.js # ANSI color-coded HTTP development logger
│   │   ├── rbac.middleware.js   # Role-based authorization guard
│   │   └── validate.middleware.js # express-validator error extractor
│   ├── models/                 # Mongoose schema definitions
│   │   ├── IdempotencyKey.js   # Idempotency store with TTL & unique indices
│   │   ├── Order.js            # Order entity
│   │   ├── OrderItem.js        # Individual line items with price snapshot
│   │   ├── Product.js          # Product catalog & stock inventory
│   │   └── User.js             # User account & password hashing
│   ├── routes/                 # Express route definitions
│   │   ├── health.routes.js
│   │   ├── order.routes.js
│   │   ├── product.routes.js
│   │   └── user.routes.js
│   ├── utils/                  # Reusable helper classes & constants
│   │   ├── apiError.js         # Custom ApiError class
│   │   ├── apiResponse.js      # Standard ApiResponse format
│   │   ├── asyncHandler.js     # Promise catch wrapper for handlers
│   │   └── roles.js            # User role constants (USER, ADMIN)
│   ├── validators/             # Request payload schemas
│   │   ├── order.validators.js
│   │   ├── product.validators.js
│   │   └── user.validators.js
│   ├── app.js                  # Express application setup
│   └── server.js               # Server bootstrap & database connect
├── tests/
│   └── concurrency.test.js     # Race-condition & stock exhaustion test
├── API_DOCS.md                 # Detailed endpoint specifications
├── DATABASE_SCHEMA.md          # Comprehensive database schema & ERD
├── package.json
└── README.md
```

---

## Authentication & Roles

Authentication is stateless and uses JWTs valid for 24 hours. The token is delivered on login/registration via an HTTP-only cookie (`accessToken`) and also returned in the response body.

For subsequent requests, supply the token via:
- **Cookie:** Sent automatically by browsers.
- **HTTP Header:**
  ```http
  Authorization: Bearer <your_jwt_token>
  ```

### Roles
- `user`: Default role assigned upon registration. Can browse products and place/view their own orders.
- `admin`: Elevated privileges. Can create and update products in the catalog and query all user profiles.

---

## API Reference

**Base URL:** `http://localhost:8000/api/v1`

### Standard Envelopes

#### Success Envelope (`2xx`)
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Operation completed successfully",
  "data": {}
}
```

#### Error Envelope (`4xx`, `5xx`)
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Error description",
  "errors": []
}
```

---

### Health

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/health` | Public | Liveness probe / health check |

---

### User & Auth Routes

Prefix: `/api/v1/user`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/user/register` | Public | Register new user account |
| `POST` | `/user/login` | Public | Authenticate user & issue JWT |
| `POST` | `/user/logout` | Authenticated | Invalidate auth cookie |
| `GET` | `/user/me` | Authenticated | Retrieve current user profile |
| `GET` | `/user/all-users` | Admin Only | List all registered users |

#### Sample Registration
```http
POST /api/v1/user/register
Content-Type: application/json

{
  "username": "alexdoe",
  "email": "alex@example.com",
  "password": "SecurePassword123!"
}
```

---

### Product Catalog Routes

Prefix: `/api/v1/products`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/products` | Public | Get all products (sorted newest first) |
| `POST` | `/products` | Admin Only | Create a new product |
| `PATCH` | `/products/:id` | Admin Only | Update product details or stock |

#### Sample Product Creation
```http
POST /api/v1/products
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "name": "Wireless Mechanical Keyboard",
  "price": 89.99,
  "stock": 50
}
```

---

### Order Routes

Prefix: `/api/v1/orders`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/orders` | Authenticated | Place a new order with atomic stock decrement |
| `GET` | `/orders` | Authenticated | List all orders for the current user (paginated) |
| `GET` | `/orders/:id` | Authenticated | Retrieve order by ID (strict ownership check) |

#### Place Order (`POST /orders`)

**Required Headers:**
```http
Authorization: Bearer <token>
Idempotency-Key: 7b34b6e8-289b-449e-b9b5-680cb4cb4d12
Content-Type: application/json
```

**Request Body:**
```json
{
  "items": [
    {
      "productId": "64f1a2b3c4d5e6f7a8b9c0d1",
      "quantity": 2
    }
  ]
}
```

**Successful Response (`201 Created`):**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Order placed successfully",
  "data": {
    "orderId": "651f84b6f12a392b45d2e128",
    "status": "confirmed",
    "totalAmount": 179.98,
    "items": [
      {
        "productId": "64f1a2b3c4d5e6f7a8b9c0d1",
        "productName": "Wireless Mechanical Keyboard",
        "quantity": 2,
        "priceAtPurchase": 89.99,
        "subtotal": 179.98
      }
    ],
    "createdAt": "2026-10-07T14:30:00.000Z"
  }
}
```

#### List My Orders (`GET /orders`)
Supports optional query parameters: `?page=1&limit=10`

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Orders fetched successfully",
  "data": {
    "orders": [ /* array of orders */ ],
    "pagination": {
      "total": 1,
      "page": 1,
      "limit": 10,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPrevPage": false
    }
  }
}
```

---

## Testing & Concurrency Verification

The test suite includes end-to-end integration tests that verify atomic concurrency under simulated race conditions:

```bash
# Run all tests
npm test

# Run concurrency suite with band execution
npm test -- --runInBand tests/concurrency.test.js
```

### Concurrency Test Scenario:
1. Provisions a product with **5 units** in stock.
2. Creates two distinct authenticated users.
3. Fires concurrent requests from both users simultaneously, each attempting to purchase all **5 units**.
4. **Verifies:**
   - Exactly one user receives `201 Created`.
   - The competing user receives `409 Conflict` (Insufficient stock).
   - Product stock ends precisely at `0` (never negative).
   - Exactly one order is created in the database.
   - Cleans up all test data on teardown.

---

## Security Best Practices

- **Zero Client Price Trust:** All calculation is driven from database records; price overrides in payloads trigger validation rejection.
- **IDOR Protection:** All user data and orders are queried with mandatory `user: req.user._id` filters.
- **Race Condition Immunity:** Stock decrements use atomic filters (`$gte`) within ACID transactions, preventing over-allocation.
- **Password Security:** Salted hashing with `bcrypt` (work factor 10) executed via pre-save hooks.
- **Header Protection:** Secured with `helmet` for HTTP response hardening and restricted CORS.
- **Graceful Error Handling:** Stack traces are suppressed in production; standardized errors prevent sensitive database leakage.
