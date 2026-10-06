import express from "express";
import dotenv from "dotenv";
dotenv.config();

import cookieParser from "cookie-parser";
import errorHandler from "./middleware/errorHandler.middleware.js";
import ApiError from "./utils/apiError.js";
import logger from "./middleware/logger.middleware.js";

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(logger);
app.use(cookieParser());

// import routers
import healthCheckRouter from "./routes/health.routes.js";
// import userRouter from "./routes/user.routes.js";

// routes the related routes :
app.use("/api/v1/health", healthCheckRouter);
// app.use("/api/v1/user", userRouter);


app.use((req, res, next) => {
  return next(
    new ApiError(
      404,
      `Route ${req.originalUrl} for specified method not found`,
    ),
  );
});

app.use(errorHandler);
export default app;
