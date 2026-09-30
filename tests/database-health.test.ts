import { beforeEach, describe, expect, it, vi } from "vitest";

import { connectToDatabase } from "@/server/db/mongoose";
import { pingDatabase } from "@/server/services/database-health";

vi.mock("@/server/db/mongoose", () => ({
  connectToDatabase: vi.fn(),
}));

describe("database health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses a non-destructive admin ping and reports the active database", async () => {
    const ping = vi.fn().mockResolvedValue({ ok: 1 });
    vi.mocked(connectToDatabase).mockResolvedValue({
      connection: {
        db: {
          databaseName: "winter_arc",
          admin: () => ({ ping }),
        },
      },
    } as never);

    await expect(pingDatabase()).resolves.toEqual({ databaseName: "winter_arc" });
    expect(ping).toHaveBeenCalledOnce();
  });

  it("fails when no active database exists", async () => {
    vi.mocked(connectToDatabase).mockResolvedValue({
      connection: { db: undefined },
    } as never);

    await expect(pingDatabase()).rejects.toThrow("no active database");
  });
});
