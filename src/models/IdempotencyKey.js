import mongoose from "mongoose";

const idempotencyKeySchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    statusCode: {
      type: Number,
      required: true,
    },
    response: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
);

idempotencyKeySchema.index({ key: 1, userId: 1 }, { unique: true });

idempotencyKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const IdempotencyKey = mongoose.model("IdempotencyKey", idempotencyKeySchema);
export default IdempotencyKey;
