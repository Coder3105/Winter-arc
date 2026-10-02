import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requestRegistration: vi.fn(),
  verifyRegistration: vi.fn(),
  requestLogin: vi.fn(),
  verifyLogin: vi.fn(),
  createSession: vi.fn(),
  cookies: vi.fn(),
  setCookie: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/server/auth/email-otp-service", () => ({
  requestRegistrationOtp: mocks.requestRegistration,
  verifyRegistrationOtp: mocks.verifyRegistration,
  requestLoginOtp: mocks.requestLogin,
  verifyLoginOtp: mocks.verifyLogin,
}));
vi.mock("@/server/auth/auth-service", () => ({ createSession: mocks.createSession }));

import { POST as requestRegistration } from "@/app/api/v1/auth/register/request-otp/route";
import { POST as verifyRegistration } from "@/app/api/v1/auth/register/verify/route";
import { POST as requestLogin } from "@/app/api/v1/auth/login/otp/request/route";
import { POST as verifyLogin } from "@/app/api/v1/auth/login/otp/verify/route";
import { SESSION_COOKIE_NAME } from "@/server/auth/session-token";

const requestResult = {
  requestId: "a".repeat(43),
  expiresInSeconds: 600,
  resendAvailableInSeconds: 60,
  message: "If the account is eligible, an authentication code has been sent.",
};
const owner = {
  id: "owner-id",
  email: "user@example.test",
  displayName: "Hunter",
};

function jsonRequest(
  path: string,
  body: unknown,
  origin: string | null = "http://local",
) {
  const headers = new Headers({ "content-type": "application/json" });
  if (origin) headers.set("origin", origin);
  headers.set("x-forwarded-for", "203.0.113.10");
  return new Request(`http://local${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("V2.2 email OTP API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue({ set: mocks.setCookie });
    mocks.requestRegistration.mockResolvedValue(requestResult);
    mocks.requestLogin.mockResolvedValue(requestResult);
    mocks.verifyRegistration.mockResolvedValue(owner);
    mocks.verifyLogin.mockResolvedValue(owner);
    mocks.createSession.mockResolvedValue({
      token: "s".repeat(43),
      expiresAt: new Date("2026-11-01T00:00:00.000Z"),
    });
  });

  it("enforces same-origin on every new public mutation", async () => {
    const requests = [
      requestRegistration(
        jsonRequest(
          "/api/v1/auth/register/request-otp",
          { email: "user@example.test" },
          null,
        ),
      ),
      verifyRegistration(
        jsonRequest(
          "/api/v1/auth/register/verify",
          {
            email: "user@example.test",
            requestId: "a".repeat(43),
            otp: "012345",
            password: "synthetic-password",
          },
          "https://evil.test",
        ),
      ),
      requestLogin(
        jsonRequest(
          "/api/v1/auth/login/otp/request",
          { email: "user@example.test" },
          null,
        ),
      ),
      verifyLogin(
        jsonRequest(
          "/api/v1/auth/login/otp/verify",
          { email: "user@example.test", requestId: "a".repeat(43), otp: "012345" },
          "https://evil.test",
        ),
      ),
    ];
    for (const response of await Promise.all(requests)) expect(response.status).toBe(403);
    expect(mocks.requestRegistration).not.toHaveBeenCalled();
    expect(mocks.verifyRegistration).not.toHaveBeenCalled();
    expect(mocks.requestLogin).not.toHaveBeenCalled();
    expect(mocks.verifyLogin).not.toHaveBeenCalled();
  });

  it("normalizes registration requests and returns only private no-store request metadata", async () => {
    const response = await requestRegistration(
      jsonRequest("/api/v1/auth/register/request-otp", { email: " User@Example.Test " }),
    );
    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.requestRegistration).toHaveBeenCalledWith(
      "user@example.test",
      "203.0.113.10",
    );
    const text = await response.text();
    expect(text).not.toContain("otpHash");
    expect(text).not.toContain("012345");
  });

  it("keeps login request responses generic and validates strict request bodies", async () => {
    const response = await requestLogin(
      jsonRequest("/api/v1/auth/login/otp/request", { email: "user@example.test" }),
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ success: true, data: requestResult });

    const malformed = await requestLogin(
      jsonRequest("/api/v1/auth/login/otp/request", {
        email: "user@example.test",
        purpose: "REGISTER",
      }),
    );
    expect(malformed.status).toBe(400);
  });

  it("creates the normal opaque session only after registration verification", async () => {
    const response = await verifyRegistration(
      jsonRequest("/api/v1/auth/register/verify", {
        email: "user@example.test",
        requestId: "a".repeat(43),
        otp: "012345",
        password: "synthetic-password",
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.verifyRegistration).toHaveBeenCalledWith({
      email: "user@example.test",
      requestId: "a".repeat(43),
      otp: "012345",
      password: "synthetic-password",
      clientAddress: "203.0.113.10",
    });
    expect(mocks.createSession).toHaveBeenCalledWith("owner-id", null);
    expect(mocks.setCookie).toHaveBeenCalledWith(
      SESSION_COOKIE_NAME,
      "s".repeat(43),
      expect.objectContaining({ httpOnly: true, sameSite: "lax" }),
    );
    const text = await response.text();
    expect(text).not.toContain("synthetic-password");
    expect(text).not.toContain("012345");
  });

  it("uses the same session contract after successful login-code verification", async () => {
    const response = await verifyLogin(
      jsonRequest("/api/v1/auth/login/otp/verify", {
        email: "user@example.test",
        requestId: "a".repeat(43),
        otp: "012345",
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.verifyLogin).toHaveBeenCalledWith(
      expect.objectContaining({ clientAddress: "203.0.113.10" }),
    );
    expect(mocks.createSession).toHaveBeenCalledWith("owner-id", null);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
