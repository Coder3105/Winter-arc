import { beforeEach, describe, expect, it, vi } from "vitest";

const rateMocks = vi.hoisted(() => ({
  connect: vi.fn(),
  init: vi.fn(),
  findOneAndUpdate: vi.fn(),
  pepper: vi.fn(),
}));

vi.mock("@/server/db/mongoose", () => ({ connectToDatabase: rateMocks.connect }));
vi.mock("@/server/email/email-provider", () => ({ getOtpPepper: rateMocks.pepper }));
vi.mock("@/server/models/auth-rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/models/auth-rate-limit")>();
  return {
    ...actual,
    AuthRateLimitModel: {
      init: rateMocks.init,
      findOneAndUpdate: rateMocks.findOneAndUpdate,
    },
  };
});

import { consumeAuthRateLimit } from "@/server/auth/auth-rate-limiter";

describe("MongoDB authentication rate limiter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateMocks.pepper.mockReturnValue("synthetic-test-pepper-that-is-long-enough");
    rateMocks.findOneAndUpdate.mockResolvedValue({ count: 1 });
  });

  it("atomically increments an opaque fixed-window identity", async () => {
    await consumeAuthRateLimit({
      scope: "OTP_IP_REQUEST",
      subject: "203.0.113.8",
      limit: 30,
      windowSeconds: 3600,
      now: new Date("2026-10-01T08:42:00.000Z"),
    });
    const [filter, update, options] = rateMocks.findOneAndUpdate.mock.calls[0]!;
    expect(filter.windowStartedAt).toEqual(new Date("2026-10-01T08:00:00.000Z"));
    expect(filter.subjectHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(filter)).not.toContain("203.0.113.8");
    expect(update).toMatchObject({ $inc: { count: 1 } });
    expect(options).toMatchObject({ upsert: true, new: true });
  });

  it("rejects the first counter value over the configured limit", async () => {
    rateMocks.findOneAndUpdate.mockResolvedValue({ count: 6 });
    await expect(
      consumeAuthRateLimit({
        scope: "OTP_EMAIL_SEND",
        subject: "LOGIN:user@example.test",
        limit: 5,
        windowSeconds: 900,
      }),
    ).rejects.toMatchObject({ code: "OTP_RATE_LIMITED" });
  });

  it("retries a concurrent upsert duplicate as a non-upserting increment", async () => {
    rateMocks.findOneAndUpdate
      .mockRejectedValueOnce({ code: 11000 })
      .mockResolvedValueOnce({ count: 2 });
    await consumeAuthRateLimit({
      scope: "OTP_IP_VERIFY",
      subject: "203.0.113.9",
      limit: 60,
      windowSeconds: 3600,
    });
    expect(rateMocks.findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(rateMocks.findOneAndUpdate.mock.calls[1]![2]).toEqual({ new: true });
  });
});
