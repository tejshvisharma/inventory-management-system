import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, "Quantity must be at least 1"],
      validate: {
        validator: Number.isInteger,
        message: "Quantity must be an integer",
      },
    },
    priceAtPurchase: {
      type: Number,
      required: true,
      min: [0, "Price at purchase cannot be negative"],
    },
  },
  { timestamps: true },
);

const OrderItem = mongoose.model("OrderItem", orderItemSchema);
export default OrderItem;
