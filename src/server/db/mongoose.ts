import "server-only";

import mongoose, { type Mongoose } from "mongoose";

import { getServerEnvironment } from "@/lib/env/server";

interface MongooseConnectionCache {
  connection: Mongoose | null;
  promise: Promise<Mongoose> | null;
}

declare global {
  var winterArcMongooseCache: MongooseConnectionCache | undefined;
}

const connectionCache: MongooseConnectionCache = globalThis.winterArcMongooseCache ?? {
  connection: null,
  promise: null,
};

globalThis.winterArcMongooseCache = connectionCache;

export async function connectToDatabase(): Promise<Mongoose> {
  if (connectionCache.connection?.connection.readyState === 1) {
    return connectionCache.connection;
  }

  if (!connectionCache.promise) {
    const environment = getServerEnvironment();

    connectionCache.promise = mongoose
      .connect(environment.MONGODB_URI, {
        dbName: environment.MONGODB_DB_NAME,
        bufferCommands: false,
        serverSelectionTimeoutMS: 8_000,
      })
      .catch((error: unknown) => {
        connectionCache.promise = null;
        throw error;
      });
  }

  connectionCache.connection = await connectionCache.promise;
  return connectionCache.connection;
}
