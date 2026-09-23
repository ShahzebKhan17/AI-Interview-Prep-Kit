import dotenv from "dotenv";
import dns from "dns";
dotenv.config();
dns.setServers(["8.8.8.8"]);
import app from "./app";
import { connectDB } from "./config/db";



const PORT = process.env.PORT || 5000;

/**
 * Connects to MongoDB and starts the Express HTTP server.
 */
export async function startServer() {
  await connectDB();
  return app.listen(PORT, () => {
    console.log(`[Server] Express backend running on http://localhost:${PORT}`);
  });
}

// Start server automatically when not in a test environment
if (process.env.NODE_ENV !== "test") {
  startServer().catch((err) => {
    console.error("[Server] Startup failed:", err);
  });
}

export { app };
export default app;
