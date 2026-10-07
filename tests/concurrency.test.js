import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import request from "supertest";
import app from "../src/app.js";
import User from "../src/models/User.js";
import Product from "../src/models/Product.js";
import Order from "../src/models/Order.js";
import OrderItem from "../src/models/OrderItem.js";
import IdempotencyKey from "../src/models/IdempotencyKey.js";
import ROLES from "../src/utils/roles.js";

const PRODUCT_PRICE = 12.5;
const INITIAL_STOCK = 5;
const PURCHASE_QUANTITY = 5;
const testRunId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const testUsers = [
  {
    username: `concurrency-user-a-${testRunId}`,
    email: `concurrency-user-a-${testRunId}@example.com`,
    password: "ConcurrencyPass123!",
  },
  {
    username: `concurrency-user-b-${testRunId}`,
    email: `concurrency-user-b-${testRunId}@example.com`,
    password: "ConcurrencyPass123!",
  },
];
const adminUser = {
  username: `concurrency-admin-${testRunId}`,
  email: `concurrency-admin-${testRunId}@example.com`,
  password: "ConcurrencyAdmin123!",
};

let productId;
let userIds = [];
let adminId;
let authTokens;

const register = async (user) => {
  const response = await request(app)
    .post("/api/v1/user/register")
    .send(user)
    .expect(201);

  return response.body.data;
};

const login = async ({ email, password }) => {
  const response = await request(app)
    .post("/api/v1/user/login")
    .send({ email, password })
    .expect(200);

  return response.body.data.accessToken;
};

describe("concurrent inventory reservation", () => {
  beforeAll(async () => {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI must be configured to run this integration test");
    }
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET must be configured to run this integration test");
    }

    await mongoose.connect(process.env.MONGO_URI);

    const admin = await register(adminUser);
    adminId = admin._id;
    await User.updateOne({ _id: adminId }, { $set: { role: ROLES.ADMIN } });
    const adminToken = await login(adminUser);

    const createdUsers = await Promise.all(testUsers.map(register));
    userIds = createdUsers.map(({ _id }) => _id);
    authTokens = await Promise.all(testUsers.map(login));

    const productResponse = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Concurrency Test Product",
        price: PRODUCT_PRICE,
        stock: INITIAL_STOCK,
      })
      .expect(201);

    productId = productResponse.body.data.id;
    expect(authTokens).toHaveLength(2);
  });

  afterAll(async () => {
    const testUserIds = [...userIds, adminId].filter(Boolean);
    const orders = testUserIds.length
      ? await Order.find({ user: { $in: testUserIds } }).select("_id").lean()
      : [];
    const orderIds = orders.map(({ _id }) => _id);

    const cleanup = [
      OrderItem.deleteMany({ order: { $in: orderIds } }),
      IdempotencyKey.deleteMany({ userId: { $in: testUserIds } }),
      Order.deleteMany({ _id: { $in: orderIds } }),
      User.deleteMany({ _id: { $in: testUserIds } }),
    ];
    if (productId) {
      cleanup.push(
        OrderItem.deleteMany({ product: productId }),
        Product.deleteOne({ _id: productId }),
      );
    }
    await Promise.all(cleanup);

    await mongoose.disconnect();
  });

  test("allows only one concurrent buyer to reserve the last five units", async () => {
    const requests = userIds.map((_, index) =>
      request(app)
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${authTokens[index]}`)
        .set("Idempotency-Key", `concurrency-order-${testRunId}-${index}`)
        .send({
          items: [{ productId, quantity: PURCHASE_QUANTITY }],
        }),
    );
    const responses = await Promise.all(requests);

    const statuses = responses.map(({ status }) => status).sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);

    const product = await Product.findById(productId).lean();
    expect(product.stock).toBe(0);
    expect(product.stock).toBeGreaterThanOrEqual(0);

    const successfulOrders = await Order.find({
      user: { $in: userIds },
    })
      .populate("items")
      .lean();
    expect(successfulOrders).toHaveLength(1);

    const [successfulOrder] = successfulOrders;
    expect(successfulOrder.totalAmount).toBe(PRODUCT_PRICE * PURCHASE_QUANTITY);
    expect(successfulOrder.items).toHaveLength(1);
    expect(successfulOrder.items[0].product.toString()).toBe(productId);
    expect(successfulOrder.items[0].quantity).toBe(PURCHASE_QUANTITY);
    expect(successfulOrder.items[0].priceAtPurchase).toBe(PRODUCT_PRICE);
  });
});
