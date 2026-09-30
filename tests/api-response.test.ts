import { describe, expect, it } from "vitest";

import { failureResponse, successResponse } from "@/lib/validation/api-response";

describe("API response helpers", () => {
  it("creates the standard success envelope", async () => {
    const response = successResponse({ status: "ready" });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: { status: "ready" },
    });
  });

  it("creates the standard error envelope", async () => {
    const response = failureResponse("VALIDATION_ERROR", "The request is invalid.", 400);

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "The request is invalid.",
      },
    });
  });
});
