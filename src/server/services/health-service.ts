import "server-only";

import { APPLICATION_NAME } from "@/lib/constants/application";

import { pingDatabase, type DatabaseHealth } from "./database-health";

export interface HealthData {
  readonly status: "ok";
  readonly application: typeof APPLICATION_NAME;
  readonly database: "connected";
  readonly databaseName: string;
  readonly timestamp: string;
}

export type DatabaseHealthCheck = () => Promise<DatabaseHealth>;
export type Clock = () => Date;

export async function getHealthData(
  checkDatabase: DatabaseHealthCheck = pingDatabase,
  now: Clock = () => new Date(),
): Promise<HealthData> {
  const database = await checkDatabase();

  return {
    status: "ok",
    application: APPLICATION_NAME,
    database: "connected",
    databaseName: database.databaseName,
    timestamp: now().toISOString(),
  };
}
