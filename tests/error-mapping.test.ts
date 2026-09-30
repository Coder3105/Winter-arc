import { describe, expect, it } from "vitest";

import { AppError, mapErrorToPublicError } from "@/server/errors/app-error";

describe("public error mapping", () => {
  it("maps known errors to their safe status and message", () => {
    expect(mapErrorToPublicError(new AppError("NOT_FOUND"))).toEqual({
      code: "NOT_FOUND",
      message: "The requested resource was not found.",
      status: 404,
    });
  });

  it("sanitizes unknown internal errors", () => {
    const mapped = mapErrorToPublicError(
      new Error("mongodb://user:password@private-host"),
    );

    expect(mapped).toEqual({
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred.",
      status: 500,
    });
    expect(mapped.message).not.toContain("password");
  });
});
