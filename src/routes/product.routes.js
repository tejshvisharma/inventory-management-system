import express from "express";
import {
  createProduct,
  getProducts,
  updateProduct,
} from "../controllers/product.controller.js";
import { isLoggedIn } from "../middleware/auth.middleware.js";
import { authorizeRoles } from "../middleware/rbac.middleware.js";
import ROLES from "../utils/roles.js";
import validate from "../middleware/validate.middleware.js";
import {
  createProductValidation,
  updateProductValidation,
} from "../validators/product.validators.js";

const router = express.Router();
const adminOnly = [isLoggedIn, authorizeRoles(ROLES.ADMIN)];

router.get("/", getProducts);
router.post(
  "/",
  ...adminOnly,
  createProductValidation,
  validate,
  createProduct,
);
router.patch(
  "/:id",
  ...adminOnly,
  updateProductValidation,
  validate,
  updateProduct,
);

export default router;
