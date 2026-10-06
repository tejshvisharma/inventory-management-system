import dotenv from "dotenv";
dotenv.config();

import connectDB from "./db/db.js";
import app from "./app.js";

const startServer = async () => {
  await connectDB();
  const PORT = process.env.PORT ?? 8000;
  app.listen(PORT, () => {
    console.log(`App is listening on PORT :${PORT}`);
  });
};

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
