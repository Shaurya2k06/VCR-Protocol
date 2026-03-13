import express from "express";
import dotenv from "dotenv";
import cors from "cors";
dotenv.config();

const app = express();
const allowedOrigins: string[] = ["*"];

// Middleware
app.use(express.json());
app.use(cors({ origin: allowedOrigins }));

// Health route
app.get("/", (_req, res) => {
  res.json({ status: "ok", env: process.env.NODE_ENV || "development" });
});

const PORT = parseInt(process.env.PORT || "3000", 10);

app.listen(PORT, () => {
  console.log(`Server started successfully on port ${PORT}`);
});
