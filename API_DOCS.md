# Inventory Order API — Documentation

> **Base URL:** `http://localhost:8000/api/v1`
> **Version:** 1.0.0
> **Stack:** Node.js · Express 5 · MongoDB (Mongoose) · JWT Auth

---

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Standard Response Format](#standard-response-format)
- [Error Format](#error-format)
- [Roles & Permissions](#roles--permissions)
- [Endpoints](#endpoints)
  - [Health](#health)
  - [Users](#users)
  - [Products](#products)
  - [Orders](#orders)
- [Middleware Reference](#middleware-reference)
- [Data Models](#data-models)
- [Running the Server](#running-the-server)

---

## Overview

RESTful API for an Inventory & Order management system. Fully implemented modules:

| Module | Status | Prefix |
|---|---|---|
| Health check | ✅ Live | `/api/v1/health` |
| User management | ✅ Live | `/api/v1/user` |
| Product management | ✅ Live | `/api/v1/products` |
| Order management | ✅ Live | `/api/v1/orders` |

---

## Authentication

The API uses **JWT (JSON Web Token)** for stateless authentication.

Tokens are issued on **register** and **login** and are valid for **24 hours**.

Pass the token in **either** of these ways:

| Method | Details |
|---|---|
| **HTTP-only Cookie** | `accessToken` cookie — set automatically by the server on login/register |
| **Authorization Header** | `Authorization: Bearer <token>` |

Protected routes return `401 Unauthorized` when the token is absent, invalid, or expired.

---

## Standard Response Format

All successful responses follow this envelope:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Human-readable message",
  "data": { }
}
```

---

## Error Format

All error responses follow this envelope:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Human-readable error message",
  "errors": [
    { "field": "email", "message": "Must be a valid email" }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `success` | `boolean` | Always `false` for errors |
| `statusCode` | `number` | HTTP status code |
| `message` | `string` | Error summary |
| `errors` | `array` | Field-level validation errors (empty `[]` for non-validation errors) |

### Error Code Reference

| Code | Meaning |
|---|---|
| `400` | Bad Request — missing header, malformed body |
| `401` | Unauthorized — no token, invalid or expired token |
| `403` | Forbidden — insufficient role |
| `404` | Not Found — resource or route doesn't exist |
| `409` | Conflict — duplicate resource or insufficient stock |
| `422` | Unprocessable Entity — body failed validation rules |
| `500` | Internal Server Error |

---

## Roles & Permissions

| Role | Value | Description |
|---|---|---|
| User | `"user"` | Default role assigned on registration |
| Admin | `"admin"` | Elevated privileges; must be set directly in the database |

---

## Endpoints

### Health

#### `GET /health`

Liveness probe — confirms the server is up.

**Auth Required:** No

**Response `200 OK`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "API is alive",
  "data": {}
}
```

---

### Users

All user endpoints are prefixed with `/user`.

---

#### `POST /user/register`

Creates a new user account and returns a JWT access token.

**Auth Required:** No

**Request Body** (`application/json`)

| Field | Type | Required | Description |
|---|---|---|---|
| `username` | `string` | ✅ | Unique username (also accepted as `name`) |
| `email` | `string` | ✅ | Unique email address |
| `password` | `string` | ✅ | Min 6 chars — bcrypt-hashed server-side |

```json
{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "Secret123!"
}
```

**Response `201 Created`**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "User registered successfully",
  "data": {
    "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
    "username": "johndoe",
    "email": "john@example.com",
    "accessToken": "<jwt>"
  }
}
```

> Also sets an `accessToken` HTTP-only cookie.

**Error Responses**

| Status | Message |
|---|---|
| `400` | All fields are required |
| `409` | User with email or username already exists |
| `422` | Validation error (field-level details in `errors` array) |
| `500` | Failed to create user |

---

#### `POST /user/login`

Authenticates an existing user and returns a JWT access token.

**Auth Required:** No

**Request Body** (`application/json`)

| Field | Type | Required | Description |
|---|---|---|---|
| `email` | `string` | ✅ | Registered email address |
| `password` | `string` | ✅ | Account password |

```json
{
  "email": "john@example.com",
  "password": "Secret123!"
}
```

**Response `200 OK`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "User logged in successfully",
  "data": {
    "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
    "username": "johndoe",
    "email": "john@example.com",
    "accessToken": "<jwt>"
  }
}
```

> Also sets an `accessToken` HTTP-only cookie.

**Error Responses**

| Status | Message |
|---|---|
| `400` | Email and password are required |
| `401` | Invalid email or password |
| `422` | Validation error |

---

#### `POST /user/logout`

Clears the authentication cookie.

**Auth Required:** ✅ `isLoggedIn`

**Request Body:** None

**Response `200 OK`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "User logged out successfully",
  "data": {}
}
```

**Error Responses**

| Status | Message |
|---|---|
| `401` | No Token Found, Unauthorized request |
| `401` | Invalid or expired token |

---

#### `GET /user/me`

Returns the currently authenticated user's profile. Password is never returned.

**Auth Required:** ✅ `isLoggedIn`

**Response `200 OK`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "getting user information",
  "data": {
    "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
    "username": "johndoe",
    "email": "john@example.com",
    "role": "user",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  }
}
```

**Error Responses**

| Status | Message |
|---|---|
| `401` | No Token Found, Unauthorized request |
| `401` | No user data found! |

---

#### `GET /user/all-users`

Returns all registered users. **Admin only.**

**Auth Required:** ✅ `isLoggedIn` + `ADMIN` role

**Response `200 OK`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Users fetched successfully",
  "data": [
    {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "username": "johndoe",
      "email": "john@example.com",
      "role": "user",
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

**Error Responses**

| Status | Message |
|---|---|
| `401` | No Token Found, Unauthorized request |
| `403` | Forbidden: admin access only |

---

### Products

All product endpoints are prefixed with `/products`.

---

#### `GET /products`

Returns all products. No authentication required.

**Response `200 OK`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Products fetched successfully",
  "data": [
    {
      "id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "name": "Keyboard",
      "price": 49.99,
      "stock": 25
    }
  ]
}
```

---

#### `POST /products`

Creates a new product. **Admin only.**

**Auth Required:** ✅ `isLoggedIn` + `ADMIN` role

**Request Body** (`application/json`)

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | ✅ | Product name |
| `price` | `number` | ✅ | Non-negative price |
| `stock` | `integer` | ✅ | Non-negative integer stock count |

```json
{
  "name": "Keyboard",
  "price": 49.99,
  "stock": 25
}
```

**Response `201 Created`**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Product created successfully",
  "data": {
    "id": "64f1a2b3c4d5e6f7a8b9c0d1",
    "name": "Keyboard",
    "price": 49.99,
    "stock": 25
  }
}
```

**Error Responses**

| Status | Message |
|---|---|
| `401` | No token or invalid/expired token |
| `403` | Forbidden: admin access only |
| `422` | Validation error (name, price, or stock) |

---

#### `PATCH /products/:id`

Partially updates a product. **Admin only.** At least one field required.

**Auth Required:** ✅ `isLoggedIn` + `ADMIN` role

**URL Params**

| Param | Description |
|---|---|
| `id` | MongoDB ObjectId of the product |

**Request Body** (`application/json`) — all fields optional, at least one required

| Field | Type | Description |
|---|---|---|
| `name` | `string` | New product name (non-empty) |
| `price` | `number` | New price (≥ 0) |
| `stock` | `integer` | New stock count (≥ 0) |

**Response `200 OK`**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Product updated successfully",
  "data": {
    "id": "64f1a2b3c4d5e6f7a8b9c0d1",
    "name": "Keyboard",
    "price": 44.99,
    "stock": 30
  }
}
```

**Error Responses**

| Status | Message |
|---|---|
| `400` | Invalid product id |
| `401` | No token or invalid/expired token |
| `403` | Forbidden: admin access only |
| `404` | Product not found |
| `422` | At least one product field is required |

---

### Orders

All order endpoints are prefixed with `/orders`.

> **Idempotency-Key** — every mutating order request **must** include this header to prevent duplicate order creation on network retries.

---

#### `POST /orders`

Places a new order. Atomically decrements product stock, computes the
server-side total, and persists the order inside a single MongoDB transaction.

**Auth Required:** ✅ `isLoggedIn`

**Required Headers**

| Header | Type | Description |
|---|---|---|
| `Authorization` | `string` | `Bearer <token>` (or use cookie) |
| `Idempotency-Key` | `string` | Client-generated unique key (UUID recommended). Max 128 chars. Same key + same user = replayed response. |

**Request Body** (`application/json`)

| Field | Type | Required | Description |
|---|---|---|---|
| `items` | `array` | ✅ | Non-empty list of order line items |
| `items[].productId` | `string` | ✅ | Valid MongoDB ObjectId of the product |
| `items[].quantity` | `integer` | ✅ | Positive integer (min: 1) |

> **Never send `price`** — any `items[].price` field in the request body is rejected with `422`. Price is always fetched from the database.

```json
{
  "items": [
    { "productId": "64f1a2b3c4d5e6f7a8b9c0d1", "quantity": 2 },
    { "productId": "64f1a2b3c4d5e6f7a8b9c0d2", "quantity": 1 }
  ]
}
```

**Response `201 Created`**

```json
{
  "success": true,
  "statusCode": 201,
  "message": "Order placed successfully",
  "data": {
    "orderId": "68f7c1a2b3d4e5f6a7b8c9d0",
    "status": "confirmed",
    "totalAmount": 149.97,
    "items": [
      {
        "productId": "64f1a2b3c4d5e6f7a8b9c0d1",
        "productName": "Keyboard",
        "quantity": 2,
        "priceAtPurchase": 49.99,
        "subtotal": 99.98
      },
      {
        "productId": "64f1a2b3c4d5e6f7a8b9c0d2",
        "productName": "Mouse",
        "quantity": 1,
        "priceAtPurchase": 49.99,
        "subtotal": 49.99
      }
    ],
    "createdAt": "2026-10-07T15:00:00.000Z"
  }
}
```

**On duplicate request (same `Idempotency-Key` + same user)**

Returns the **exact same** `201` response body as the original request — no new order is created.

**Error Responses**

| Status | Condition | Message example |
|---|---|---|
| `400` | `Idempotency-Key` header missing | `Idempotency-Key header is required to prevent duplicate orders` |
| `400` | Key exceeds 128 characters | `Idempotency-Key must not exceed 128 characters` |
| `401` | Missing or invalid token | `No Token Found, Unauthorized request` |
| `404` | `productId` does not exist in DB | `Product not found: <id>` |
| `409` | Product exists but stock < quantity | `Insufficient stock for "<name>" — requested: 5, available: 2` |
| `422` | Body validation failure | Field-level errors in `errors` array |

---

#### `GET /orders/:id`

Fetches a single order by ID. **Ownership is enforced at the database level** — a user can only retrieve their own orders.

**Auth Required:** ✅ `isLoggedIn`

**URL Params**

| Param | Description |
|---|---|
| `id` | MongoDB ObjectId of the order to retrieve |

**How ownership is enforced**

The query is **not** a simple `Order.findById(id)`. It uses a compound filter:

```js
Order.findOne({ _id: id, user: req.user._id })
```

Both conditions must match in the same DB call. This means:

| Scenario | DB result | Response |
|---|---|---|
| Order exists and belongs to the authenticated user | Document returned | `200 OK` |
| Order doesn't exist at all | `null` | `404 Not Found` |
| Order exists but belongs to a different user | `null` | `404 Not Found` |

The last two cases are **intentionally identical** — no information is leaked about whether the order ID belongs to another user.

**Response `200 OK`**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Order fetched successfully",
  "data": {
    "orderId": "68f7c1a2b3d4e5f6a7b8c9d0",
    "status": "confirmed",
    "totalAmount": 149.97,
    "items": [
      {
        "productName": "Keyboard",
        "quantity": 2,
        "priceAtPurchase": 49.99,
        "subtotal": 99.98
      },
      {
        "productName": "Mouse",
        "quantity": 1,
        "priceAtPurchase": 49.99,
        "subtotal": 49.99
      }
    ],
    "createdAt": "2026-10-07T15:00:00.000Z",
    "updatedAt": "2026-10-07T15:00:00.000Z"
  }
}
```

**Error Responses**

| Status | Condition |
|---|---|
| `400` | `id` is not a valid MongoDB ObjectId |
| `401` | Missing or invalid token |
| `404` | Order not found **or** order belongs to a different user |

---

#### How Idempotency Works

```
First request (new key)
  → Check DB: key not found
  → Run transaction
  → Save key + response in DB
  → Return 201

Retry / duplicate (same key, same user)
  → Check DB: key found
  → Return stored 201 immediately — no DB writes, no stock change

Race condition (two requests arrive simultaneously with the same key)
  → Both pass the pre-transaction check (key not yet in DB)
  → Transaction 1 commits and saves the key
  → Transaction 2 hits the unique-index constraint (code 11000)
     → aborts its transaction (stock rollback)
     → reads the winner's stored response
     → replays it
```

> Keys automatically expire after **24 hours** via MongoDB's TTL index — no manual cleanup needed.

---

#### Order Processing Algorithm

```
POST /orders
      │
      ▼
1.  isLoggedIn — verify JWT → attach req.user
      │
      ▼
2.  Validate body (express-validator)
    • items non-empty array
    • items[].productId = valid ObjectId
    • items[].quantity = integer ≥ 1
    • items[].price = REJECTED (422)
      │
      ▼
3.  Check Idempotency-Key header
    • Missing / too long → 400
      │
      ▼
4.  IdempotencyKey.findOne({ key, userId })
    • HIT  → replay stored response (exit early)
    • MISS → continue
      │
      ▼
5.  normalizeItems()
    • Merge duplicate productIds — sum their quantities
      │
      ▼
6.  mongoose.startSession() → startTransaction()
      │
      ├─ for each normalized item (sequential):
      │       Product.findOneAndUpdate(
      │         { _id, stock: { $gte: quantity } },  ← atomic guard
      │         { $inc: { stock: -quantity } },
      │         { new: true, session }
      │       )
      │       null? → follow-up findById:
      │               still null → 404
      │               found     → 409 Insufficient stock
      │       ok    → collect { priceAtPurchase, subtotal }
      │
      ├─ totalAmount = Σ(DB_price × quantity)   ← server-side only
      │
      ├─ orderId = new ObjectId()               ← pre-allocated
      │
      ├─ OrderItem.insertMany([...], { session })
      │
      ├─ Order.create([{ _id: orderId, ... }], { session })
      │
      ├─ IdempotencyKey.create([{ key, response, expiresAt }], { session })
      │   └─ unique(key,userId) — race-condition last line of defence
      │
      └─ commitTransaction()
           │ on any error → abortTransaction() → endSession()
           │ code 11000   → replay winning response
      │
      ▼
7.  Return 201 with order details
```

---

## Middleware Reference

| Middleware | File | Description |
|---|---|---|
| `isLoggedIn` | `auth.middleware.js` | Verifies JWT from `accessToken` cookie or `Authorization: Bearer` header; attaches `req.user` |
| `authorizeRoles(...roles)` | `rbac.middleware.js` | Checks `req.user.role` against the allowed roles list; throws `403` if not permitted |
| `validate` | `validate.middleware.js` | Runs `express-validator` result; returns `422` with per-field `{field, message}` array on failure |
| `errorHandler` | `errorHandler.middleware.js` | Global error handler — formats thrown `ApiError` into `{statusCode, message, errors, success}` JSON |
| `logger` | `logger.middleware.js` | Coloured dev-mode request logger (method, status, path, duration); silent in production |

---

## Data Models

### User

| Field | Type | Constraints | Default |
|---|---|---|---|
| `_id` | `ObjectId` | Auto-generated | — |
| `username` | `String` | Required, Unique | — |
| `email` | `String` | Required, Unique | — |
| `password` | `String` | Required, bcrypt-hashed (never returned) | — |
| `role` | `String` | `enum: ["user", "admin"]` | `"user"` |
| `createdAt` | `Date` | Auto (timestamps) | — |
| `updatedAt` | `Date` | Auto (timestamps) | — |

---

### Product

| Field | Type | Constraints | Default |
|---|---|---|---|
| `_id` | `ObjectId` | Auto-generated; exposed as `id` in responses | — |
| `name` | `String` | Required, trimmed | — |
| `price` | `Number` | Required, min `0` | — |
| `stock` | `Number` | Required, integer, min `0` | — |
| `createdAt` | `Date` | Auto (timestamps) | — |
| `updatedAt` | `Date` | Auto (timestamps) | — |

---

### Order

| Field | Type | Constraints | Default |
|---|---|---|---|
| `_id` | `ObjectId` | Auto-generated (pre-allocated before items) | — |
| `user` | `ObjectId` | Ref → `User`, Required, indexed | — |
| `items` | `ObjectId[]` | Refs → `OrderItem` | `[]` |
| `totalAmount` | `Number` | Required, min `0`, server-computed | — |
| `status` | `String` | `enum: ["confirmed", "cancelled"]` | `"confirmed"` |
| `createdAt` | `Date` | Auto (timestamps) | — |
| `updatedAt` | `Date` | Auto (timestamps) | — |

---

### OrderItem

| Field | Type | Constraints | Default |
|---|---|---|---|
| `_id` | `ObjectId` | Auto-generated | — |
| `order` | `ObjectId` | Ref → `Order`, Required, indexed | — |
| `product` | `ObjectId` | Ref → `Product`, Required | — |
| `quantity` | `Number` | Required, integer, min `1` | — |
| `priceAtPurchase` | `Number` | Required, min `0` — **snapshot** of `Product.price` at order time | — |
| `createdAt` | `Date` | Auto (timestamps) | — |
| `updatedAt` | `Date` | Auto (timestamps) | — |

> `priceAtPurchase` is a price snapshot — future changes to `Product.price` never alter historical order totals.

---

### IdempotencyKey

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `_id` | `ObjectId` | Auto-generated | — |
| `key` | `String` | Required | Raw header value from client |
| `userId` | `ObjectId` | Ref → `User`, Required | Scopes key per user |
| `statusCode` | `Number` | Required | HTTP status of original response |
| `response` | `Mixed` | Required | Full response body for replay |
| `expiresAt` | `Date` | Required, TTL index | Auto-deleted by MongoDB at this time |
| `createdAt` | `Date` | Auto (timestamps) | — |

**Indexes:**
- Compound unique index `{ key: 1, userId: 1 }` — prevents duplicate saves, acts as race-condition guard
- TTL index `{ expiresAt: 1 }` with `expireAfterSeconds: 0` — automatic 24 h expiry

---

## Running the Server

```bash
# Install dependencies
npm install

# Start with hot-reload (development)
npm run dev
```

Default port: **`8000`** — configurable via the `PORT` environment variable.

### Required Environment Variables

| Variable | Description |
|---|---|
| `PORT` | Server port (default: `8000`) |
| `MONGO_URI` | MongoDB connection string (replica set required for transactions) |
| `JWT_SECRET` | Secret key for signing JWTs |
| `NODE_ENV` | `development` or `production` (affects cookie `secure` / `sameSite` flags and request logging) |
| `MONGO_RETRY_DELAY_MS` | ms to wait between MongoDB reconnect attempts (default: `5000`) |

> **Transactions require a MongoDB replica set.** A standalone `mongod` instance does not support multi-document transactions. Use a replica set locally or MongoDB Atlas.
