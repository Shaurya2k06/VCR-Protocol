// ─── VCR Protocol — Express Server Entry Point ────────────────────────────────
import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";

import policyRouter from "./routes/policy.js";
import verifyRouter from "./routes/verify.js";
import registerRouter from "./routes/register.js";
import demoRouter from "./routes/demo.js";
import walletRouter from "./routes/wallet.js";
import ipfsRouter from "./routes/ipfsUpload.js";
import documentsRouter from "./routes/documentRoutes.js";

const app = express();
const PORT = parseInt(process.env.PORT ?? "3001");

// ─── Middleware ───────────────────────────────────────────────────────────────
const corsOptions = {
  origin: "*",
}
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Request logger (dev)
if (process.env.NODE_ENV !== "production") {
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get("/api/health", (_, res) => {
  res.json({
    status: "ok",
    service: "VCR Protocol API",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    db: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use("/api/policy", policyRouter);
app.use("/api/verify", verifyRouter);
app.use("/api/register", registerRouter);
app.use("/api/demo", demoRouter);
app.use("/api/wallet", walletRouter);
app.use("/api/ipfs", ipfsRouter);
app.use("/api/documents", documentsRouter);

// ─── Global Error Handler ─────────────────────────────────────────────────────

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error", message: err.message });
});

// ─── Database + Server Start ──────────────────────────────────────────────────

async function start() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI must be set in environment");
  }

  console.log("Connecting to MongoDB...");
  await mongoose.connect(mongoUri);
  console.log("✅ MongoDB connected");

  app.listen(PORT, () => {
    console.log(`\n🔐 VCR Protocol API running at http://localhost:${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/api/health`);
    console.log(`   Policy: http://localhost:${PORT}/api/policy`);
    console.log(`   Verify: http://localhost:${PORT}/api/verify`);
    console.log(`   Register: http://localhost:${PORT}/api/register`);
    console.log(`   Demo: http://localhost:${PORT}/api/demo`);
    console.log(`   Wallet: http://localhost:${PORT}/api/wallet\n`);
    console.log(`   IPFS: http://localhost:${PORT}/api/ipfs`);
    console.log(`   Documents: http://localhost:${PORT}/api/documents\n`);
  });
}

start().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
