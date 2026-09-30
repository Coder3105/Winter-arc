import "server-only";

import { connectToDatabase } from "@/server/db/mongoose";

export interface DatabaseHealth {
  readonly databaseName: string;
}

export async function pingDatabase(): Promise<DatabaseHealth> {
  const databaseConnection = await connectToDatabase();
  const database = databaseConnection.connection.db;

  if (!database) {
    throw new Error("Database connection has no active database.");
  }

  await database.admin().ping();

  return { databaseName: database.databaseName };
}
