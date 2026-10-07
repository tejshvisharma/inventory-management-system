import { body } from "express-validator";
import mongoose from "mongoose";

export const createOrderValidation = [
  // items must be a non-empty array
  body("items")
    .isArray({ min: 1 })
    .withMessage("items must be a non-empty array"),

  // Each item's productId must be a valid MongoDB ObjectId
  body("items.*.productId")
    .notEmpty()
    .withMessage("productId is required")
    .bail()
    .custom((value) => mongoose.isValidObjectId(value))
    .withMessage("productId must be a valid MongoDB ObjectId"),

  // Each item's quantity must be a positive integer (no fractions, no 0)
  body("items.*.quantity")
    .isInt({ min: 1 })
    .withMessage("quantity must be a positive integer (min: 1)"),

  // Reject any price sent by the client — price is always fetched from the DB
  body("items.*.price")
    .not()
    .exists()
    .withMessage("price must not be sent by the client; it is set server-side"),
];
