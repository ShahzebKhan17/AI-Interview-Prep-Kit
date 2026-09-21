import mongoose from "mongoose";

/**
 * MongoDB connection configuration foundation.
 * Note: Application-specific models are omitted at this stage as per requirements.
 */
export async function connectDB(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    console.warn(
      "[Database] MONGODB_URI is not set in environment variables. Database connection skipped."
    );
    return;
  }

  try {
    await mongoose.connect(mongoUri);
    console.log("[Database] Connected successfully to MongoDB.");
  } catch (error) {
    console.error("[Database] Failed to connect to MongoDB:", error);
    // In foundation/development stage, log the error rather than terminating the process
  }
}

export function isDbConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
