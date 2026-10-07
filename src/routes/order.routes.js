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

router.post("/", isLoggedIn, createOrderValidation, validate, createOrder);
router.get("/", isLoggedIn, getMyOrders);
router.get("/:id", isLoggedIn, getOrderById);

export default router;
