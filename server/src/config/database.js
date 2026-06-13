import mongoose from "mongoose";

/**
 * MongoDB connection management via Mongoose (Req 19.2).
 *
 * The connection string is a bootstrap secret sourced only from the
 * environment and is never exposed to the frontend. This module owns the
 * lifecycle of the single shared Mongoose connection: connect, disconnect,
 * and connection-state inspection.
 */

// Apply strict query filtering to mitigate operator-injection surface and
// keep behavior deterministic across Mongoose versions.
mongoose.set("strictQuery", true);

/**
 * Resolve the MongoDB connection string from the environment.
 *
 * @param {string} [uri] Optional explicit URI (primarily for tests).
 * @returns {string} The resolved connection string.
 * @throws {Error} When no connection string is available.
 */
function resolveUri(uri) {
  const resolved = uri || process.env.MONGODB_URI;
  if (!resolved || typeof resolved !== "string" || resolved.trim() === "") {
    throw new Error("MONGODB_URI is not configured");
  }
  return resolved;
}

/**
 * Connect to MongoDB using Mongoose. Reuses the existing connection when one
 * is already established so repeated calls are safe.
 *
 * @param {string} [uri] Optional explicit connection string.
 * @param {import("mongoose").ConnectOptions} [options] Optional Mongoose options.
 * @returns {Promise<typeof mongoose>} The connected Mongoose instance.
 */
export async function connectDatabase(uri, options = {}) {
  // 1 = connected, 2 = connecting. Reuse rather than opening a second connection.
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  const connectionString = resolveUri(uri);

  // Register lifecycle listeners once per process.
  if (!connectDatabase._listenersBound) {
    mongoose.connection.on("error", (err) => {
      // Detail stays server-side only (Req 27.5); never surfaced to clients.
      // eslint-disable-next-line no-console
      console.error("MongoDB connection error:", err.message);
    });
    mongoose.connection.on("disconnected", () => {
      // eslint-disable-next-line no-console
      console.warn("MongoDB disconnected");
    });
    connectDatabase._listenersBound = true;
  }

  await mongoose.connect(connectionString, {
    serverSelectionTimeoutMS: 10000,
    ...options,
  });

  // eslint-disable-next-line no-console
  console.log("MongoDB connected");
  return mongoose;
}

/**
 * Disconnect the shared Mongoose connection. Safe to call when not connected.
 *
 * @returns {Promise<void>}
 */
export async function disconnectDatabase() {
  if (mongoose.connection.readyState === 0) {
    return;
  }
  await mongoose.disconnect();
}

/**
 * Report whether the shared Mongoose connection is currently established.
 *
 * @returns {boolean}
 */
export function isDatabaseConnected() {
  return mongoose.connection.readyState === 1;
}

export default connectDatabase;
