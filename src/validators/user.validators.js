import { body } from "express-validator";

export const registerUserValidation = [
  body("username").optional().trim(),
  body("name").optional().trim(),
  body().custom((_, { req }) => {
    const username = req.body?.username ?? req.body?.name;

    if (!username || String(username).trim() === "") {
      throw new Error("Username is required");
    }

    return true;
  }),
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
