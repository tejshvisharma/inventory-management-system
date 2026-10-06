import express from "express";
import {
  loginUser,
  registerUser,
  getAllUsers,
  getMe,
  logoutUser,
} from "../controllers/user.controllers.js";
import { isLoggedIn } from "../middleware/auth.middleware.js";
import validate from "../middleware/validate.middleware.js";
import {
  registerUserValidation,
  loginUserValidation,
} from "../validators/user.validators.js";
import { authorizeRoles } from "../middleware/rbac.middleware.js";
import ROLES from "../utils/roles.js";
const router = express.Router();

router.post("/register", registerUserValidation, validate, registerUser);
router.post("/login", loginUserValidation, validate, loginUser);
router.post("/logout", isLoggedIn, logoutUser);
router.get("/me", isLoggedIn, getMe);
router.get("/all-users", isLoggedIn, authorizeRoles(ROLES.ADMIN), getAllUsers);

export default router;
