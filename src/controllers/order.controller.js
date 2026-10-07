import mongoose from "mongoose";
import asyncHandler from "../utils/asyncHandler.js";
import ApiError from "../utils/apiError.js";
import ApiResponse from "../utils/apiResponse.js";
import Product from "../models/Product.js";
import Order from "../models/Order.js";
import OrderItem from "../models/OrderItem.js";
import IdempotencyKey from "../models/IdempotencyKey.js";

// Idempotency keys expire after 24 hours (matches JWT lifetime)
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Normalize items array: merge duplicate productIds by summing their
 * quantities so a single atomic decrement covers the full requested amount.
 *
 * e.g.  [{productId:"A", qty:1}, {productId:"A", qty:2}]
 *       → [{productId:"A", quantity:3}]
 */
function normalizeItems(items) {
  const map = new Map();

  for (const { productId, quantity } of items) {
    const key = productId.toString();
    if (map.has(key)) {
      map.get(key).quantity += quantity;
    } else {
      map.set(key, { productId: key, quantity });
    }
  }

  return Array.from(map.values());
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/orders
// ─────────────────────────────────────────────────────────────────────────────
export const createOrder = asyncHandler(async (req, res) => {
  // ── Step 1: Validate the Idempotency-Key header ──────────────────────────
  const idempotencyKey = req.headers["idempotency-key"]?.trim();

  if (!idempotencyKey) {
    throw new ApiError(
      400,
      "Idempotency-Key header is required to prevent duplicate orders",
    );
  }

  if (idempotencyKey.length > 128) {
    throw new ApiError(400, "Idempotency-Key must not exceed 128 characters");
  }

  const userId = req.user._id;

  // ── Step 2: Return cached response for duplicate/retried requests ─────────
  // This check happens OUTSIDE the transaction so it short-circuits cheaply.
  const existingKey = await IdempotencyKey.findOne({
    key: idempotencyKey,
    userId,
  });

  if (existingKey) {
    // Replay the exact same response that the original request produced.
    return res.status(existingKey.statusCode).json(existingKey.response);
  }

  // ── Step 3: Normalize items (deduplicate productIds) ──────────────────────
  const normalizedItems = normalizeItems(req.body.items);

  // ── Step 4: Open a MongoDB multi-document transaction ─────────────────────
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // ── Step 5: Atomic stock decrement — one product at a time ──────────────
    // We intentionally process sequentially (not with Promise.all) because
    // concurrent operations on the same session can cause driver-level issues.
    const lineItems = [];

    for (const { productId, quantity } of normalizedItems) {
      /*
       * ATOMIC FILTER + UPDATE
       * ┌─────────────────────────────────────────────┐
       * │ filter: { _id: productId, stock: {$gte: q} }│
       * │ update: { $inc: { stock: -q } }             │
       * └─────────────────────────────────────────────┘
       * If the filter matches → stock is decremented and the updated doc is
       * returned.  If no doc is returned → either the product doesn't exist
       * OR stock < quantity.  We do a follow-up read to tell the client which.
       *
       * This single atomic operation is the key anti-overselling guarantee.
       */
      const updated = await Product.findOneAndUpdate(
        { _id: productId, stock: { $gte: quantity } },
        { $inc: { stock: -quantity } },
        { new: true, session },
      );

      if (!updated) {
        // Disambiguate: is it missing or just low stock?
        const exists = await Product.findById(productId)
          .session(session)
          .lean();

        if (!exists) {
          throw new ApiError(404, `Product not found: ${productId}`);
        }

        throw new ApiError(
          409,
          `Insufficient stock for "${exists.name}" — ` +
            `requested: ${quantity}, available: ${exists.stock}`,
        );
      }

      lineItems.push({
        productId: updated._id,
        productName: updated.name,
        quantity,
        // Snapshot the DB price — never use a client-supplied value
        priceAtPurchase: updated.price,
        subtotal: updated.price * quantity,
      });
    }

    // ── Step 6: Calculate server-side total ───────────────────────────────
    const totalAmount = lineItems.reduce(
      (acc, item) => acc + item.subtotal,
      0,
    );

    // ── Step 7: Pre-generate Order _id to break the chicken-and-egg cycle ─
    // OrderItems need an orderId; Order needs orderItem _ids.
    // We resolve this by pre-allocating the Order _id before creating either.
    const orderId = new mongoose.Types.ObjectId();

    // ── Step 8: Bulk-create OrderItems ────────────────────────────────────
    const orderItems = await OrderItem.insertMany(
      lineItems.map((item) => ({
        order: orderId,
        product: item.productId,
        quantity: item.quantity,
        priceAtPurchase: item.priceAtPurchase,
      })),
      { session },
    );

    const orderItemIds = orderItems.map((oi) => oi._id);

    // ── Step 9: Create the Order document ────────────────────────────────
    // Order.create() inside a transaction requires the array form.
    const [order] = await Order.create(
      [
        {
          _id: orderId,
          user: userId,
          items: orderItemIds,
          totalAmount,
        },
      ],
      { session },
    );

    // ── Step 10: Build the response payload ───────────────────────────────
    const responsePayload = new ApiResponse(
      201,
      {
        orderId: order._id,
        status: order.status,
        totalAmount: order.totalAmount,
        items: lineItems.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          priceAtPurchase: item.priceAtPurchase,
          subtotal: item.subtotal,
        })),
        createdAt: order.createdAt,
      },
      "Order placed successfully",
    );

    // ── Step 11: Persist the IdempotencyKey inside the transaction ────────
    // Saving inside the transaction means if anything above rolled back, the
    // key is never stored — preventing a ghost record for a failed order.
    //
    // The compound unique index on (key, userId) is the last safety net:
    // if two identical requests race past Step 2, the second insert will
    // throw a duplicate-key error (code 11000), aborting its transaction.
    await IdempotencyKey.create(
      [
        {
          key: idempotencyKey,
          userId,
          statusCode: 201,
          response: responsePayload,
          expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
        },
      ],
      { session },
    );

    // ── Step 12: Commit — all-or-nothing ─────────────────────────────────
    await session.commitTransaction();

    return res.status(201).json(responsePayload);
  } catch (error) {
    await session.abortTransaction();

    // MongoDB can reject the losing transaction with a write conflict before
    // the conditional stock update gets a chance to observe the committed
    // winner. Report that contention as the same conflict clients receive
    // when stock is already insufficient.
    if (error.code === 112) {
      throw new ApiError(
        409,
        "Insufficient stock due to a concurrent order",
      );
    }

    // ── Race-condition guard ───────────────────────────────────────────────
    // Two requests with the same idempotency key both passed Step 2 (the
    // pre-transaction check) and raced into the transaction.  The duplicate-key
    // error from the idempotency insert tells us the first request won.
    // We replay the winning response rather than surfacing a confusing 500.
    if (error.code === 11000) {
      const cached = await IdempotencyKey.findOne({
        key: idempotencyKey,
        userId,
      });
      if (cached) {
        return res.status(cached.statusCode).json(cached.response);
      }
    }

    throw error;
  } finally {
    // Always release the session, even on success
    session.endSession();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/orders/:id
// ─────────────────────────────────────────────────────────────────────────────
export const getOrderById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // ── 1. Validate the route param is a well-formed ObjectId ────────────────
  // Reject early so MongoDB never receives a malformed query.
  if (!mongoose.isValidObjectId(id)) {
    throw new ApiError(400, "Invalid order id");
  }

  // ── 2. Ownership-enforcing compound query ─────────────────────────────────
  // Both conditions must match simultaneously in the SAME find call.
  //
  //   { _id: id, user: req.user._id }
  //
  // This means:
  //   • If the order doesn't exist            → null → 404
  //   • If the order belongs to someone else  → null → 404
  //
  // The caller receives an identical 404 in both cases — no information
  // leakage about whether the order ID is valid for another user.
  const order = await Order.findOne({
    _id: id,
    user: req.user._id,
  }).populate({
    path: "items",
    select: "product quantity priceAtPurchase -_id",
    populate: {
      path: "product",
      select: "name price -_id",
    },
  });

  if (!order) {
    throw new ApiError(404, "Order not found");
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        orderId: order._id,
        status: order.status,
        totalAmount: order.totalAmount,
        items: order.items.map((item) => ({
          productName: item.product?.name,
          quantity: item.quantity,
          priceAtPurchase: item.priceAtPurchase,
          subtotal: item.priceAtPurchase * item.quantity,
        })),
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      },
      "Order fetched successfully",
    ),
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/orders
// ─────────────────────────────────────────────────────────────────────────────
export const getMyOrders = asyncHandler(async (req, res) => {
  // ── Pagination (optional query params: ?page=1&limit=10) ─────────────────
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
  const skip = (page - 1) * limit;

  // ── Filter: only this user's orders ──────────────────────────────────────
  // The { user: req.user._id } filter is the ownership boundary —
  // no user can ever see another user's orders regardless of query params.
  const filter = { user: req.user._id };

  // Run count and data fetch in parallel for efficiency
  const [total, orders] = await Promise.all([
    Order.countDocuments(filter),
    Order.find(filter)
      .sort({ createdAt: -1 }) // newest first
      .skip(skip)
      .limit(limit)
      .populate({
        path: "items",
        select: "product quantity priceAtPurchase -_id",
        populate: {
          path: "product",
          select: "name price -_id",
        },
      }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        orders: orders.map((order) => ({
          orderId: order._id,
          status: order.status,
          totalAmount: order.totalAmount,
          items: order.items.map((item) => ({
            productName: item.product?.name,
            quantity: item.quantity,
            priceAtPurchase: item.priceAtPurchase,
            subtotal: item.priceAtPurchase * item.quantity,
          })),
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
        })),
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      },
      "Orders fetched successfully",
    ),
  );
});
