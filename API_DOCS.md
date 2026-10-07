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
  - [Products](#products)
  - [Users](#users)
- [Middleware Reference](#middleware-reference)
- [Data Models](#data-models)
- [Running the Server](#running-the-server)

---

## Overview

This is a RESTful API for an Inventory & Order management system. The current implementation includes:

- **Health check** — server liveness probe
- **User management** — register, login, logout, profile, admin user listing
- **Product management** — public product listing with admin-only create and update

> **Note:** `Order`, `OrderItem`, and `IdempotencyKey` models are scaffolded but not yet implemented.

---

## Authentication

The API uses **JWT (JSON Web Token)** for authentication.

### How to Authenticate

Tokens are issued on **register** and **login** and are valid for **24 hours**.

You can pass the token in either of two ways:

| Method | Details |
|---|---|
| **Cookie** | `accessToken` HTTP-only cookie (set automatically by the server) |
| **Authorization header** | JWT value supplied in the Authorization header |

Protected routes return `401 Unauthorized` when the JWT is missing, invalid, or expired.

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
| `errors` | `array` | Field-level validation errors (may be empty `[]`) |

### Common Error Codes

| Code | Meaning |
|---|---|
| `400` | Bad Request — missing or malformed body fields |
| `401` | Unauthorized — no token or invalid/expired token |
| `403` | Forbidden — authenticated but insufficient role |
| `404` | Not Found — route does not exist |
| `409` | Conflict — resource already exists |
| `422` | Unprocessable Entity — validation failed |
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

Liveness probe to check if the server is running.

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

### Products

All product endpoints are prefixed with `/products`.

#### `POST /products`

Creates a product.

**Auth Required:** Yes — admin only

**Request Body** (`application/json`)

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | ✅ | Product name |
| `price` | `number` | ✅ | Non-negative product price |
| `stock` | `integer` | ✅ | Non-negative inventory quantity |

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

#### `GET /products`

Returns all products. Authentication is not required.

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

#### `PATCH /products/:id`

Updates one or more product fields.

**Auth Required:** Yes — admin only

The request body may contain `name`, `price`, and/or `stock`. At least one
field is required.

Product responses use the following shape:

```json
{
  "id": "64f1a2b3c4d5e6f7a8b9c0d1",
  "name": "Keyboard",
  "price": 49.99,
  "stock": 25
}
```

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
| `422` | Validation error; at least one product field is required |

---

### Users

All user endpoints are prefixed with `/user`.

The user router is mounted in `app.js` with `app.use("/api/v1/user", userRouter)`.

---

#### `POST /user/register`

Creates a new user account and returns a JWT access token.

**Auth Required:** No

**Request Body** (`application/json`)

| Field | Type | Required | Description |
|---|---|---|---|
| `username` | `string` | ✅ | Unique username (also accepted as `name`) |
| `email` | `string` | ✅ | Unique email address |
| `password` | `string` | ✅ | Plain-text password (bcrypt-hashed, cost=10) |

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

Clears the authentication cookie and logs out the current user.

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

Returns the profile of the currently authenticated user. Password is never included.

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

Returns a list of all registered users. **Admin only.**

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

## Middleware Reference

| Middleware | File | Description |
|---|---|---|
| `isLoggedIn` | `auth.middleware.js` | Verifies JWT from cookie or `Authorization: Bearer` header; attaches `req.user` |
| `authorizeRoles(...roles)` | `rbac.middleware.js` | Checks `req.user.role` against the allowed roles list |
| `validate` | `validate.middleware.js` | Runs `express-validator` results; returns `422` with field-level errors on failure |
| `errorHandler` | `errorHandler.middleware.js` | Global error handler; formats all thrown `ApiError` instances into JSON |
| `logger` | `logger.middleware.js` | Request logging |

---

## Data Models

### User

| Field | Type | Constraints | Default |
|---|---|---|---|
| `_id` | `ObjectId` | Auto-generated | — |
| `username` | `String` | Required, Unique | — |
| `email` | `String` | Required, Unique | — |
| `password` | `String` | Required, bcrypt-hashed | — |
| `role` | `String` | `enum: ["user", "admin"]` | `"user"` |
| `createdAt` | `Date` | Auto (timestamps) | — |
| `updatedAt` | `Date` | Auto (timestamps) | — |

> Password is **never** returned in API responses.

---

### Product

| Field | Type | Constraints | Default |
|---|---|---|---|
| `_id` | `ObjectId` | Auto-generated; exposed as `id` in product responses | — |
| `name` | `String` | Required, trimmed | — |
| `price` | `Number` | Required, minimum `0` | — |
| `stock` | `Number` | Required, integer, minimum `0` | — |
| `createdAt` | `Date` | Auto (timestamps) | — |
| `updatedAt` | `Date` | Auto (timestamps) | — |

### Upcoming Models *(scaffolded, not yet implemented)*

| Model | File |
|---|---|
| `Order` | `models/Order.js` |
| `OrderItem` | `models/OrderItem.js` |
| `IdempotencyKey` | `models/IdempotencyKey.js` |

---

## Running the Server

```bash
# Install dependencies
npm install

# Development (nodemon hot-reload)
npm run dev
```

Default port: **`8000`** (configurable via the `PORT` env variable).

### Required Environment Variables

| Variable | Description |
|---|---|
| `PORT` | Server port (default: `8000`) |
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret key for signing JWTs |
| `NODE_ENV` | `development` or `production` (affects cookie `secure` and `sameSite` flags) |
