import express from "express";
import {
  createOrder,
  getOrderById,
  getMyOrders,
} from "../controllers/order.controller.js";
import { isLoggedIn } from "../middleware/auth.middleware.js";
import validate from "../middleware/validate.middleware.js";
import { createOrderValidation } from "../validators/order.validators.js";

const router = express.Router();

// POST /api/v1/orders
// Auth → validate body → create order with transaction
router.post("/", isLoggedIn, createOrderValidation, validate, createOrder);
// GET /api/v1/orders/
router.get("/", isLoggedIn, getMyOrders);
// GET /api/v1/orders/:id
router.get("/:id", isLoggedIn, getOrderById);

export default router;
