import express from "express";
import { createOrder } from "../controllers/order.controller.js";
import { isLoggedIn } from "../middleware/auth.middleware.js";
import validate from "../middleware/validate.middleware.js";
import { createOrderValidation } from "../validators/order.validators.js";

const router = express.Router();

// POST /api/v1/orders
// Auth → validate body → create order with transaction
router.post("/", isLoggedIn, createOrderValidation, validate, createOrder);

export default router;
