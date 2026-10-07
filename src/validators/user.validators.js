import { body } from "express-validator";

export const registerUserValidation = [
  body("username")
    .notEmpty()
    .withMessage("Username is required")
    .bail()
    .isString()
    .withMessage("Username must be a string"),
  body("email").trim().isEmail().withMessage("Valid email is required"),
  body("password")
    .trim()
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters"),
];

export const loginUserValidation = [
  body("email").trim().isEmail().withMessage("Valid email is required"),
  body("password").trim().notEmpty().withMessage("Password is required"),
];
