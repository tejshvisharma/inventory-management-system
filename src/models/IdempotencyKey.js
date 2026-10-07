import mongoose from "mongoose";

const idempotencyKeySchema = new mongoose.Schema(
  {
    // The raw key string sent by the client via the Idempotency-Key header.
    key: {
      type: String,
      required: true,
    },
    // Scoped per user: same key string from different users is treated as
    // a separate idempotency record.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // The HTTP status code of the original response, replayed on duplicates.
    statusCode: {
      type: Number,
      required: true,
    },
    // The full response body that will be replayed for duplicate requests.
    response: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    // MongoDB TTL index: document is automatically deleted when expiresAt is
    // reached (expireAfterSeconds: 0 means "delete exactly at expiresAt").
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
);

// Compound unique index ensures the same (key, user) pair cannot be inserted
// twice, even under concurrent requests (race condition guard).
idempotencyKeySchema.index({ key: 1, userId: 1 }, { unique: true });

// TTL index: MongoDB background task removes expired documents automatically.
idempotencyKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const IdempotencyKey = mongoose.model("IdempotencyKey", idempotencyKeySchema);
export default IdempotencyKey;

