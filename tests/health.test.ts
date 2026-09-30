import { describe, expect, it, vi } from "vitest";

import { createHealthHandler } from "@/app/api/v1/health/route";
import { getHealthData } from "@/server/services/health-service";

const fixedDate = new Date("2026-09-30T00:00:00.000Z");

describe("health service", () => {
  it("reports connected only after the database check succeeds", async () => {
    const checkDatabase = vi.fn().mockResolvedValue({
      databaseName: "winter_arc",
    });

    await expect(getHealthData(checkDatabase, () => fixedDate)).resolves.toEqual({
      status: "ok",
      application: "winter-arc",
      database: "connected",
      databaseName: "winter_arc",
      timestamp: fixedDate.toISOString(),
    });
    expect(checkDatabase).toHaveBeenCalledOnce();
  });
});

describe("health route", () => {
  it("returns the standard response after a genuine check dependency succeeds", async () => {
    const handler = createHealthHandler({
      checkDatabase: async () => ({ databaseName: "winter_arc" }),
      now: () => fixedDate,
    });

    const response = await handler();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        database: "connected",
        databaseName: "winter_arc",
      },
    });
  });

  it("returns a sanitized 503 when the database check fails", async () => {
    const handler = createHealthHandler({
      checkDatabase: async () => {
        throw new Error("private database detail");
      },
    });

    const response = await handler();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      success: false,
      error: {
        code: "DATABASE_UNAVAILABLE",
        message: "Database connection unavailable.",
      },
    });
    expect(JSON.stringify(body)).not.toContain("private database detail");
  });
});
