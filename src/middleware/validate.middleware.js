import { validationResult } from "express-validator";
import ApiError from "../utils/apiError.js";

const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const extractedErrors = errors.array().map((err) => ({
      field: err.path,
      message: err.message,
    }));

    return next(
      new ApiError(422, "Received data is not valid", extractedErrors),
    );
  }

  next();
};

export default validate;
