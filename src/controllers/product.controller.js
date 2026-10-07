import mongoose from "mongoose";
import Product from "../models/Product.js";
import asyncHandler from "../utils/asyncHandler.js";
import ApiError from "../utils/apiError.js";
import ApiResponse from "../utils/apiResponse.js";

const serializeProduct = (product) => ({
  id: product._id.toString(),
  name: product.name,
  price: product.price,
  stock: product.stock,
});

const productFieldsFrom = (body) => {
  const { name, price, stock } = body;
  return { name, price, stock };
};

export const createProduct = asyncHandler(async (req, res) => {
  const product = await Product.create(productFieldsFrom(req.body));

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        serializeProduct(product),
        "Product created successfully",
      ),
    );
});

export const getProducts = asyncHandler(async (req, res) => {
  const products = await Product.find().sort({ createdAt: -1 });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        products.map(serializeProduct),
        "Products fetched successfully",
      ),
    );
});

export const updateProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    throw new ApiError(400, "Invalid product id");
  }

  const product = await Product.findByIdAndUpdate(id, productFieldsFrom(req.body), {
    new: true,
    runValidators: true,
  });

  if (!product) {
    throw new ApiError(404, "Product not found");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        serializeProduct(product),
        "Product updated successfully",
      ),
    );
});
