import ApiResponse from "../utils/apiResponse.js";

export const healthCheck = async (req, res) => {
  res.status(200).json(new ApiResponse(200, {}, "API is alive"));
};
