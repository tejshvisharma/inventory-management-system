import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();
const MONGO_RETRY_DELAY_MS = Number(process.env.MONGO_RETRY_DELAY_MS || 5000);

const connectDB = async () => {
  const MONGO_URI = process.env.MONGO_URI;

  if (!MONGO_URI) {
    throw new Error("MONGO_URI is not defined");
  }

  while (true) {
    try {
      await mongoose.connect(MONGO_URI);
      console.log("✅ MongoDB connected successfully");
      return;
    } catch (error) {
      console.error("❌ MongoDB connection failed, retrying...", error.message);
      await new Promise((resolve) => setTimeout(resolve, MONGO_RETRY_DELAY_MS));
    }
  }
};

export default connectDB;
