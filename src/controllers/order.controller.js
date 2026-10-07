import mongoose from "mongoose";
import asyncHandler from "../utils/asyncHandler.js";
import ApiError from "../utils/apiError.js";
import ApiResponse from "../utils/apiResponse.js";
import Product from "../models/Product.js";
import Order from "../models/Order.js";
import OrderItem from "../models/OrderItem.js";
import IdempotencyKey from "../models/IdempotencyKey.js";

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

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

export const createOrder = asyncHandler(async (req, res) => {
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

  const existingKey = await IdempotencyKey.findOne({
    key: idempotencyKey,
    userId,
  });

  if (existingKey) {
    return res.status(existingKey.statusCode).json(existingKey.response);
  }

  const normalizedItems = normalizeItems(req.body.items);
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const lineItems = [];

    for (const { productId, quantity } of normalizedItems) {
      const updated = await Product.findOneAndUpdate(
        { _id: productId, stock: { $gte: quantity } },
        { $inc: { stock: -quantity } },
        { new: true, session },
      );

      if (!updated) {
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
        priceAtPurchase: updated.price,
        subtotal: updated.price * quantity,
      });
    }

    const totalAmount = lineItems.reduce(
      (acc, item) => acc + item.subtotal,
      0,
    );

    const orderId = new mongoose.Types.ObjectId();

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

    await session.commitTransaction();

    return res.status(201).json(responsePayload);
  } catch (error) {
    await session.abortTransaction();

    if (error.code === 112) {
      throw new ApiError(
        409,
        "Insufficient stock due to a concurrent order",
      );
    }

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
    session.endSession();
  }
});

export const getOrderById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    throw new ApiError(400, "Invalid order id");
  }

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

export const getMyOrders = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
  const skip = (page - 1) * limit;

  const filter = { user: req.user._id };

  const [total, orders] = await Promise.all([
    Order.countDocuments(filter),
    Order.find(filter)
      .sort({ createdAt: -1 })
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
