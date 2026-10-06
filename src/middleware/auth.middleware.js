import asyncHandler from "../utils/asyncHandler.js";
import jwt from "jsonwebtoken";
import ApiError from "../utils/apiError.js";
import dotenv from "dotenv";
dotenv.config();
import User from "../models/User.js";

const isLoggedIn = asyncHandler(async (req, res, next) => {
  const cookieToken = req.cookies?.accessToken?.trim();
  const authHeader = req.header("Authorization");
  let headerToken = "";

  if (authHeader && authHeader.startsWith("Bearer ")) {
    headerToken = authHeader.replace("Bearer ", "").trim();
  } else if (!cookieToken && authHeader) {
    throw new ApiError(401, "Authorization header missing or invalid");
  }

  const accessToken = cookieToken || headerToken;

  if (!accessToken) {
    throw new ApiError(401, "No Token Found, Unauthorized request");
  }

  try {
    const decoded = jwt.verify(accessToken, process.env.JWT_SECRET);
    const user = await User.findById(decoded?._id).select(
      "_id username email role",
    );

    if (!user) {
      throw new ApiError(401, "User not found");
    }

    req.user = user;

    next();
  } catch (err) {
    if (err.name === "TokenExpiredError" || err.name === "JsonWebTokenError") {
      throw new ApiError(401, "Invalid or expired token");
    }

    throw err;
  }
});

export { isLoggedIn };
