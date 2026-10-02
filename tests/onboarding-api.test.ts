import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";

vi.mock("@/server/auth/api-auth", () => ({ getApiOwner: vi.fn() }));
vi.mock("@/server/services/onboarding-service", () => ({
  getOnboardingDraft: vi.fn(),
  saveOnboardingDraft: vi.fn(),
  activateOnboarding: vi.fn(),
}));

import {
  GET as getOnboarding,
  PUT as putOnboarding,
} from "@/app/api/v1/onboarding/route";
import { POST as activate } from "@/app/api/v1/onboarding/activate/route";
import { getApiOwner } from "@/server/auth/api-auth";
import {
  activateOnboarding,
  getOnboardingDraft,
  saveOnboardingDraft,
} from "@/server/services/onboarding-service";
import type { OnboardingDraftInput } from "@/lib/validation/onboarding";
import { OnboardingOperationError } from "@/server/errors/onboarding-error-handler";

const valid = {
  displayName: "New Hunter",
  heightCm: null,
  currentWeightKg: null,
  targetWeightKg: null,
  ageAtBaseline: null,
  sex: null,
  timezone: "UTC",
  startDate: "2026-10-05",
  weeklyWorkoutTarget: 4,
  rules: [{ key: "journaling" as const, target: null }],
} satisfies OnboardingDraftInput;

describe("onboarding APIs", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("returns actionable field validation before activation", async () => {
    vi.mocked(getApiOwner).mockResolvedValue({
      id: "owner-a",
      email: "a@example.test",
      displayName: "Hunter",
    });
    const response = await activate(
      new Request("http://test", {
        method: "POST",
        body: JSON.stringify({ ...valid, timezone: null, rules: [] }),
      }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toContain("Timezone: Explicitly select a timezone");
    expect(body.error.message).toContain("Select at least one Daily Quest rule");
    expect(activateOnboarding).not.toHaveBeenCalled();
  });

  it("logs the failing stage and validator, with a matching public reference and no private values", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(getApiOwner).mockResolvedValue({
      id: "owner-a",
      email: "a@example.test",
      displayName: "Hunter",
    });
    const error = new mongoose.Error.ValidationError();
    error.addError(
      "rules.0.order",
      new mongoose.Error.ValidatorError({
        path: "order",
        type: "max",
        value: "private-value",
        message: "private-value mongodb://private:password@host",
      }),
    );
    vi.mocked(activateOnboarding).mockRejectedValue(
      new OnboardingOperationError("config_write", error),
    );
    const response = await activate(
      new Request("http://test", { method: "POST", body: JSON.stringify(valid) }),
    );
    const body = await response.json();
    expect(response.status).toBe(500);
    expect(log).toHaveBeenCalledExactlyOnceWith("[onboarding] Request failed", {
      reference: expect.any(String),
      stage: "config_write",
      category: "MODEL_VALIDATION",
      databaseCode: null,
      fields: [{ path: "rules.0.order", validator: "max" }],
    });
    const diagnostic = log.mock.calls[0]![1] as { reference: string };
    expect(body.error.message).toContain(diagnostic.reference);
    expect(JSON.stringify([body, log.mock.calls])).not.toMatch(
      /private-value|password|a@example|owner-a/,
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("logs unknown failures without printing raw messages or stacks", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(getApiOwner).mockRejectedValue(
      new Error("SMTP password private@example.test"),
    );
    const response = await activate(new Request("http://test", { method: "POST" }));
    expect(response.status).toBe(500);
    expect(log).toHaveBeenCalledWith(
      "[onboarding] Request failed",
      expect.objectContaining({ stage: "request", category: "UNEXPECTED_ERROR" }),
    );
    expect(JSON.stringify([await response.json(), log.mock.calls])).not.toMatch(
      /SMTP|password|private@example/,
    );
  });

  it("rejects unauthenticated reads and writes", async () => {
    vi.mocked(getApiOwner).mockResolvedValue(null);
    expect((await getOnboarding()).status).toBe(401);
    expect(
      (
        await putOnboarding(
          new Request("http://test", { method: "PUT", body: JSON.stringify(valid) }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await activate(
          new Request("http://test", { method: "POST", body: JSON.stringify(valid) }),
        )
      ).status,
    ).toBe(401);
  });

  it("uses only the authenticated owner for draft read and write", async () => {
    vi.mocked(getApiOwner).mockResolvedValue({
      id: "owner-a",
      email: "a@example.test",
      displayName: "Hunter",
    });
    vi.mocked(getOnboardingDraft).mockResolvedValue(null);
    expect((await getOnboarding()).status).toBe(200);
    expect(getOnboardingDraft).toHaveBeenCalledExactlyOnceWith("owner-a");

    vi.mocked(saveOnboardingDraft).mockResolvedValue({
      ...valid,
      updatedAt: "2026-10-01T00:00:00.000Z",
    });
    const response = await putOnboarding(
      new Request("http://test", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...valid, userId: "owner-b" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(saveOnboardingDraft).toHaveBeenCalledExactlyOnceWith("owner-a", valid);
  });

  it("validates and activates only for the session owner", async () => {
    vi.mocked(getApiOwner).mockResolvedValue({
      id: "owner-a",
      email: "a@example.test",
      displayName: "Hunter",
    });
    vi.mocked(activateOnboarding).mockResolvedValue({
      configId: "config-a",
      alreadyActive: false,
    });
    const response = await activate(
      new Request("http://test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...valid, userId: "owner-b" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(activateOnboarding).toHaveBeenCalledExactlyOnceWith("owner-a", valid);
  });
});
