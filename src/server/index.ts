import dotenv from "dotenv";
import express, { Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { connectDB, isDbConnected } from "./config/db";
import { HealthCheckResponse } from "../shared/types";
import authRoutes from "./routes/auth.routes";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";

// Standard Middlewares
app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// Foundation Health Check Route
app.get("/health", (_req: Request, res: Response<HealthCheckResponse>) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    database: isDbConnected() ? "connected" : "disconnected",
    uptime: process.uptime(),
  });
});

// Root Foundation Route
app.get("/", (_req: Request, res: Response) => {
  res.json({
    message: "AI Interview Prep Kit API - Foundation Server Running",
  });
});

// Authentication Routes (Stage 2A)
app.use("/api/auth", authRoutes);

// Initialize database connection & start server
connectDB().finally(() => {
  app.listen(PORT, () => {
    console.log(`[Server] Express backend running on http://localhost:${PORT}`);
  });
});

export default app;
