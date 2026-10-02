import { isValidElement, useMemo, useState, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SetupFlow } from "@/components/setup/setup-flow";
import { DAILY_RULE_CATALOGUE } from "@/features/winter-arc/rules";
import type { OnboardingDraftInput } from "@/lib/validation/onboarding";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: vi.fn(),
  useMemo: vi.fn((factory: () => unknown) => factory()),
  useState: vi.fn(),
}));

const completeDraft: OnboardingDraftInput & { updatedAt: string } = {
  displayName: "New Hunter",
  heightCm: null,
  currentWeightKg: null,
  targetWeightKg: null,
  ageAtBaseline: null,
  sex: null,
  timezone: "Asia/Kolkata",
  startDate: "2026-10-05",
  weeklyWorkoutTarget: 4,
  rules: [
    { key: "sleep", target: 7 },
    { key: "hydration", target: 3 },
    { key: "steps", target: 10_000 },
    { key: "nutrition", target: null },
  ],
  updatedAt: "2026-10-01T00:00:00.000Z",
};

let states: unknown[];
let cursor: number;
function render(initialDraft: typeof completeDraft | null = null) {
  cursor = 0;
  return SetupFlow({ email: "new@example.com", initialDraft });
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

describe("new-user setup flow", () => {
  beforeEach(() => {
    states = [];
    cursor = 0;
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    vi.mocked(useMemo).mockImplementation((factory) => factory());
    vi.mocked(useState).mockImplementation(((initial: unknown) => {
      const index = cursor++;
      if (index >= states.length) {
        states.push(
          typeof initial === "function" ? (initial as () => unknown)() : initial,
        );
      }
      return [
        states[index],
        (value: unknown) => {
          states[index] = typeof value === "function" ? value(states[index]) : value;
        },
      ];
    }) as typeof useState);
  });

  it("starts with blank identity and optional physical values", () => {
    const identity = render();
    expect(
      elements(identity).find(
        (element) => element.type === "input" && element.props.readOnly === true,
      )?.props.value,
    ).toBe("new@example.com");
    expect(
      elements(identity).find(
        (element) =>
          element.type === "input" && element.props.autoComplete === "nickname",
      )?.props.value,
    ).toBe("");

    states[0] = 1;
    const profile = render();
    const editableValues = elements(profile)
      .filter((element) => element.type === "input")
      .map((element) => element.props.value);
    expect(editableValues).toEqual(["", "", "", ""]);
    expect(text(profile)).toContain("no body-composition assessment is created");
  });

  it("preselects only recommended public rules and never No Fap", () => {
    render();
    states[0] = 2;
    const tree = render();
    const labels = elements(tree).filter((element) => element.type === "label");
    const noFap = labels.find((element) =>
      text(element.props.children).includes("NO FAP // PRIVATE"),
    );
    const noFapCheckbox = elements(noFap?.props.children).find(
      (element) => element.type === "input" && element.props.type === "checkbox",
    );
    expect(noFapCheckbox?.props.checked).toBe(false);
    expect(
      (states[1] as { rules: Array<{ key: string }> }).rules.map((rule) => rule.key),
    ).toEqual(["sleep", "hydration", "steps", "nutrition"]);
    expect(DAILY_RULE_CATALOGUE).toHaveLength(11);
  });

  it("saves an owner-scoped draft without activating", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { draft: {} } }), {
        status: 200,
      }),
    );
    click(render(), "SAVE DRAFT");
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe("/api/v1/onboarding");
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]?.[1]?.body as string);
    expect(body).toMatchObject({
      displayName: "",
      heightCm: null,
      currentWeightKg: null,
      targetWeightKg: null,
      timezone: null,
      startDate: null,
      weeklyWorkoutTarget: null,
    });
    expect(body.rules.map((rule: { key: string }) => rule.key)).not.toContain("no_fap");
  });

  it("uses the browser timezone only after explicit detect and accept actions", () => {
    render(completeDraft);
    states[0] = 4;
    states[1] = { ...(states[1] as object), timezone: "" };
    click(render(completeDraft), "DETECT BROWSER TIMEZONE");
    expect(typeof states[4]).toBe("string");
    expect(String(states[4]).length).toBeGreaterThan(0);
    click(render(completeDraft), "USE THIS TIMEZONE");
    expect((states[1] as { timezone: string }).timezone).toBe(states[4]);
  });

  it("activates with one request and routes to Today", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { configId: "config-1" } }), {
        status: 200,
      }),
    );
    render(completeDraft);
    states[0] = 5;
    click(render(completeDraft), "ACTIVATE WINTER ARC");
    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith("/today"));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe("/api/v1/onboarding/activate");
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]?.[1]?.body as string);
    expect(body.rules).toHaveLength(4);
    expect(body.rules.map((rule: { key: string }) => rule.key)).not.toContain("no_fap");
  });

  it("shows server error feedback and allows retry without losing the form", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "The server could not complete setup. Reference: test-reference",
          },
        }),
        { status: 500 },
      ),
    );
    render(completeDraft);
    states[0] = 5;
    const originalForm = states[1];
    click(render(completeDraft), "ACTIVATE WINTER ARC");
    await vi.waitFor(() =>
      expect(text(render(completeDraft))).toContain("Reference: test-reference"),
    );
    expect(states[1]).toEqual(originalForm);
    expect(states[2]).toBe(false);
    expect(router.replace).not.toHaveBeenCalled();
    expect(
      elements(render(completeDraft)).some((element) => element.props.role === "alert"),
    ).toBe(true);
  });

  it("handles a non-JSON server failure without masking the status", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("<html>Bad gateway</html>", { status: 502 }),
    );
    render(completeDraft);
    states[0] = 5;
    click(render(completeDraft), "ACTIVATE WINTER ARC");
    await vi.waitFor(() => expect(text(render(completeDraft))).toContain("HTTP 502"));
    expect(states[2]).toBe(false);
  });

  it("returns to the invalid field's step before sending activation", () => {
    render({ ...completeDraft, timezone: null });
    states[0] = 5;
    click(render(completeDraft), "ACTIVATE WINTER ARC");
    expect(states[0]).toBe(4);
    expect(text(render(completeDraft))).toContain("Explicitly select a timezone");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows validation feedback returned when saving a draft", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Display name: Enter a valid value.",
          },
        }),
        { status: 400 },
      ),
    );
    click(render(), "SAVE DRAFT");
    await vi.waitFor(() =>
      expect(text(render())).toContain("Display name: Enter a valid value."),
    );
  });
});
