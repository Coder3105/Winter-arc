import { isValidElement, useState, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SetupFlow } from "@/components/setup/setup-flow";
import { createDefaultDailyRules } from "@/features/winter-arc/rules";
import { getSetupIssue } from "@/lib/validation/setup";
import { profileInputSchema } from "@/lib/validation/profile";
import { TIMEZONE_OPTIONS } from "@/lib/utils/timezones";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: vi.fn(),
}));

const profile = {
  displayName: "Test owner",
  ageAtBaseline: 24,
  sex: "male" as const,
  heightCm: 178,
  preferredWeightUnit: "kg" as const,
  preferredDistanceUnit: "km" as const,
  timezone: "Asia/Kolkata",
};
const config = {
  name: "Winter Arc",
  durationDays: 90,
  startDate: "2026-10-01",
  startingWeightKg: 111.1,
  targetWeightKg: null,
  weeklyWorkoutTarget: 4,
  rules: createDefaultDailyRules(),
};

// Exercise the form's actual event handlers with deterministic hook state.
let states: unknown[];
let cursor: number;
function render(initialProfile = profile) {
  cursor = 0;
  return SetupFlow({ initialProfile, initialConfig: config, baseline: null });
}
type Element = {
  type: unknown;
  props: Record<string, unknown> & { children?: ReactNode };
};
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [node as Element, ...elements(node.props.children)];
}
function text(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return isValidElement<{ children?: ReactNode }>(node) ? text(node.props.children) : "";
}
function click(tree: ReactNode, label: string) {
  const button = elements(tree).find(
    (element) =>
      element.type === "button" && text(element.props.children).includes(label),
  );
  if (!button) throw new Error(`Missing button: ${label}`);
  (button.props.onClick as () => void)();
}

describe("setup activation", () => {
  beforeEach(() => {
    states = [];
    cursor = 0;
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    vi.mocked(useState).mockImplementation(((initial: unknown) => {
      const index = cursor++;
      if (index >= states.length) states.push(initial);
      return [
        states[index],
        (value: unknown) => {
          states[index] = typeof value === "function" ? value(states[index]) : value;
        },
      ];
    }) as typeof useState);
  });

  it("blocks skipping to confirmation with missing timezone and identifies the field", () => {
    click(render({ ...profile, timezone: "" }), "SYSTEM READY");
    const tree = render();
    expect(states[0]).toBe(0);
    expect(text(tree)).toContain("Timezone: Select your timezone.");
    expect(fetch).not.toHaveBeenCalled();
    expect(
      elements(tree).some(
        (element) => element.type === "select" && element.props.value === "",
      ),
    ).toBe(true);
    expect(text(tree)).toContain("Asia/Kolkata");
    expect(text(tree)).toContain("America/New_York");
  });

  it("revalidates at Activate and sends no request for an incomplete profile", () => {
    click(render(), "SYSTEM READY");
    states[3] = { ...profile, dateOfBirth: null, timezone: "" };
    click(render(), "ACTIVATE");
    expect(states[0]).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("activates a valid profile and protocol in order", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    click(render(), "SYSTEM READY");
    const ready = render();
    expect(text(ready)).not.toContain("SAVE / ACTIVATE");
    click(ready, "ACTIVATE");
    await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith("/"));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe("/api/v1/profile");
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0]?.[1]?.body as string).timezone).toBe(
      "Asia/Kolkata",
    );
    expect(JSON.parse(vi.mocked(fetch).mock.calls[1]?.[1]?.body as string).status).toBe(
      "ACTIVE",
    );
  });

  it("does not mislabel server failures as profile validation failures", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("Unavailable", { status: 503 }));
    click(render(), "SYSTEM READY");
    click(render(), "ACTIVATE");
    await vi.waitFor(() => expect(states[2]).toContain("server could not save profile"));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(router.push).not.toHaveBeenCalled();
  });

  it("returns protocol and rule validation errors to the matching step", () => {
    expect(getSetupIssue(profile, { ...config, startDate: "2026-02-30" })).toMatchObject({
      step: 1,
      field: "startDate",
    });
    const invalidRules = config.rules.map((rule) =>
      rule.type === "NUMERIC_MINIMUM" ? { ...rule, target: 0 } : rule,
    );
    expect(getSetupIssue(profile, { ...config, rules: invalidRules })).toMatchObject({
      step: 2,
      field: "rules",
    });
    expect(getSetupIssue(profile, { ...config, rules: invalidRules }, 1)).toBeNull();
  });

  it("validates dropdown options and accepts existing timezone aliases", () => {
    for (const timezone of [...TIMEZONE_OPTIONS, "Asia/Calcutta"]) {
      expect(profileInputSchema.safeParse({ ...profile, timezone }).success).toBe(true);
    }
    expect(
      profileInputSchema.safeParse({ ...profile, timezone: "Not/A_Timezone" }).success,
    ).toBe(false);
  });
});
