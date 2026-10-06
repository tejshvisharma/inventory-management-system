import User from "../models/User.js";
import asyncHandler from "../utils/asyncHandler.js";
import ApiResponse from "../utils/apiResponse.js";
import ApiError from "../utils/apiError.js";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
dotenv.config();

function generateToken(userId) {
  const token = jwt.sign({ _id: userId }, process.env.JWT_SECRET, {
    expiresIn: "24h",
  });

  return token;
}

function getCookieOptions() {
  const isProduction = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: 24 * 60 * 60 * 1000,
  };
}

export const registerUser = asyncHandler(async (req, res) => {
  const requestBody = req.body ?? {};
  const username = requestBody.username ?? requestBody.name;
  const { email, password } = requestBody;

  if (!username || !email || !password) {
    throw new ApiError(400, "All fields are required");
  }

  const existingUser = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (existingUser) {
    throw new ApiError(409, "User with email or username already exists");
  }

  const user = await User.create({ username, email, password });
  const createdUser = await User.findById(user._id).select("-password");

  if (!createdUser) {
    throw new ApiError(500, "Failed to create user");
  }

  const accessToken = generateToken(user._id);
  const cookieOptions = getCookieOptions();

  return res
    .status(201)
    .cookie("accessToken", accessToken, cookieOptions)
    .json(
      new ApiResponse(
        201,
        {
          _id: createdUser._id,
          username: createdUser.username,
          email: createdUser.email,
          accessToken: accessToken,
        },
        "User registered successfully",
      ),
    );
});

export const loginUser = asyncHandler(async (req, res) => {
  const requestBody = req.body ?? {};
  const { email, password } = requestBody;

  if (!email || !password) {
    throw new ApiError(400, "Email and password are required");
  }

  const user = await User.findOne({ email });

  if (!user) {
    throw new ApiError(401, "Invalid email or password");
  }

  const isPasswordValid = await user.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid email or password");
  }

  const loggedInUser = await User.findById(user._id).select("-password");

  const accessToken = generateToken(user._id);
  const cookieOptions = getCookieOptions();

  return res
    .status(200)
    .cookie("accessToken", accessToken, cookieOptions)
    .json(
      new ApiResponse(
        200,
        {
          _id: loggedInUser._id,
          username: loggedInUser.username,
          email: loggedInUser.email,
          accessToken: accessToken,
        },
        "User logged in successfully",
      ),
    );
});

export const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user?._id).select("-password");

  if (!user) {
    throw new ApiError(401, "No user data found!");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, user, "getting user information"));
});

export const logoutUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .clearCookie("accessToken")
    .json(new ApiResponse(200, {}, "User logged out successfully"));
});

export const getAllUsers = asyncHandler(async (req, res) => {
  const users = await User.find().select("-password");
  return res
    .status(200)
    .json(new ApiResponse(200, users, "Users fetched successfully"));
});
