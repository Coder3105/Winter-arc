import { describe, expect, it } from "vitest";

import {
  evaluateDailyQuest,
  type DailyQuestEvaluationInput,
  type DailyQuestResponse,
  type DailyQuestRuleSnapshot,
} from "@/server/daily-quest/evaluation";

const rules: DailyQuestRuleSnapshot[] = [
  {
    key: "morning_weight",
    name: "Morning Weight",
    type: "LOGGING_REQUIREMENT",
    target: null,
    unit: null,
    requiredFrequency: 7,
    order: 1,
  },
  {
    key: "sleep",
    name: "Sleep",
    type: "NUMERIC_MINIMUM",
    target: 8,
    unit: "hours",
    requiredFrequency: 7,
    order: 2,
  },
  {
    key: "hydration",
    name: "Hydration",
    type: "NUMERIC_MINIMUM",
    target: 3,
    unit: "litres",
    requiredFrequency: 7,
    order: 3,
  },
  {
    key: "no_junk_food",
    name: "No Junk Food",
    type: "BOOLEAN",
    target: null,
    unit: null,
    requiredFrequency: 7,
    order: 4,
  },
  {
    key: "no_fap",
    name: "No Fap",
    type: "BOOLEAN",
    target: null,
    unit: null,
    requiredFrequency: 7,
    order: 5,
  },
  {
    key: "steps",
    name: "Steps",
    type: "NUMERIC_MINIMUM",
    target: 10_000,
    unit: "steps",
    requiredFrequency: 7,
    order: 6,
  },
  {
    key: "nutrition",
    name: "Nutrition",
    type: "BOOLEAN",
    target: null,
    unit: null,
    requiredFrequency: 7,
    order: 7,
  },
];

const recordedAt = "2026-09-30T10:00:00.000Z";
const booleanResponse = (value: boolean): DailyQuestResponse => ({
  kind: "BOOLEAN",
  booleanValue: value,
  recordedAt,
});
const numericResponse = (value: number): DailyQuestResponse => ({
  kind: "NUMERIC",
  numericValue: value,
  recordedAt,
});

function input(
  responses: Record<string, DailyQuestResponse> = {},
  patch: Partial<DailyQuestEvaluationInput> = {},
): DailyQuestEvaluationInput {
  return {
    id: "quest-1",
    date: "2026-09-30",
    timezone: "Asia/Kolkata",
    challengeDay: 17,
    challengeWeek: 3,
    durationDays: 90,
    rules,
    responses,
    currentLocalDate: "2026-09-30",
    completedAt: null,
    createdAt: recordedAt,
    updatedAt: recordedAt,
    ...patch,
  };
}

function allPassingResponses() {
  return {
    morning_weight: booleanResponse(true),
    sleep: numericResponse(8),
    hydration: numericResponse(3),
    no_junk_food: booleanResponse(true),
    no_fap: booleanResponse(true),
    steps: numericResponse(10_000),
    nutrition: booleanResponse(true),
  };
}

describe("Daily Quest rule evaluation", () => {
  it.each([
    ["sleep", 7.9, "FAIL", 98.75],
    ["sleep", 8, "PASS", 100],
    ["sleep", 9, "PASS", 100],
    ["hydration", 2.25, "FAIL", 75],
    ["hydration", 3, "PASS", 100],
    ["hydration", 3.5, "PASS", 100],
    ["steps", 9_999, "FAIL", 99.99],
    ["steps", 10_000, "PASS", 100],
    ["steps", 12_000, "PASS", 100],
  ] as const)("evaluates %s at %s", (key, value, state, completionPercent) => {
    const rule = evaluateDailyQuest(input({ [key]: numericResponse(value) })).rules.find(
      (candidate) => candidate.key === key,
    );
    expect(rule).toMatchObject({ actual: value, state, completionPercent });
  });

  it.each(["sleep", "hydration", "steps"])(
    "keeps absent %s numeric response unrecorded",
    (key) => {
      expect(
        evaluateDailyQuest(input()).rules.find((rule) => rule.key === key),
      ).toMatchObject({ actual: null, state: "NOT_RECORDED", completionPercent: null });
    },
  );

  it.each(["morning_weight", "no_junk_food", "no_fap", "nutrition"])(
    "distinguishes all states for %s",
    (key) => {
      expect(
        evaluateDailyQuest(input()).rules.find((rule) => rule.key === key)?.state,
      ).toBe("NOT_RECORDED");
      expect(
        evaluateDailyQuest(input({ [key]: booleanResponse(true) })).rules.find(
          (rule) => rule.key === key,
        ),
      ).toMatchObject({ actual: true, state: "PASS" });
      expect(
        evaluateDailyQuest(input({ [key]: booleanResponse(false) })).rules.find(
          (rule) => rule.key === key,
        ),
      ).toMatchObject({ actual: false, state: "FAIL" });
    },
  );

  it("uses the snapshotted sleep target rather than the default", () => {
    const result = evaluateDailyQuest(input({ sleep: numericResponse(7.5) }));
    expect(result.rules.find((rule) => rule.key === "sleep")).toMatchObject({
      target: 8,
      state: "FAIL",
      completionPercent: 93.75,
    });
  });

  it("does not treat a mismatched persisted response kind as recorded", () => {
    const result = evaluateDailyQuest(
      input({ sleep: booleanResponse(true), no_fap: numericResponse(1) }),
    );
    expect(result.rules.find((rule) => rule.key === "sleep")?.state).toBe("NOT_RECORDED");
    expect(result.rules.find((rule) => rule.key === "no_fap")?.state).toBe(
      "NOT_RECORDED",
    );
  });

  it("marks a malformed numeric snapshot without a target not applicable", () => {
    const malformed = rules.map((rule) =>
      rule.key === "sleep" ? { ...rule, target: null } : rule,
    );
    expect(
      evaluateDailyQuest(
        input({ sleep: numericResponse(8) }, { rules: malformed }),
      ).rules.find((rule) => rule.key === "sleep")?.state,
    ).toBe("NOT_APPLICABLE");
  });
});

describe("Daily Quest status and completion", () => {
  it("starts at zero of seven without equating missing to failure", () => {
    const result = evaluateDailyQuest(input());
    expect(result).toMatchObject({
      status: "NOT_STARTED",
      completedRequiredRules: 0,
      totalRequiredRules: 7,
      completionPercent: 0,
      isPerfectDay: false,
    });
    expect(result.rules.every((rule) => rule.state === "NOT_RECORDED")).toBe(true);
  });

  it("is in progress after one response", () => {
    expect(evaluateDailyQuest(input({ hydration: numericResponse(0.5) }))).toMatchObject({
      status: "IN_PROGRESS",
      completedRequiredRules: 0,
      completionPercent: 0,
      isPerfectDay: false,
    });
  });

  it("keeps today's explicit failed habit in progress", () => {
    expect(
      evaluateDailyQuest(input({ no_junk_food: booleanResponse(false) })).status,
    ).toBe("IN_PROGRESS");
  });

  it("marks any past incomplete record missed", () => {
    expect(evaluateDailyQuest(input({}, { currentLocalDate: "2026-10-01" })).status).toBe(
      "MISSED",
    );
    expect(
      evaluateDailyQuest(
        input({ no_fap: booleanResponse(false) }, { currentLocalDate: "2026-10-01" }),
      ).status,
    ).toBe("MISSED");
  });

  it("makes every required pass a perfect completed day", () => {
    expect(evaluateDailyQuest(input(allPassingResponses()))).toMatchObject({
      status: "COMPLETE",
      completedRequiredRules: 7,
      totalRequiredRules: 7,
      completionPercent: 100,
      isPerfectDay: true,
    });
  });

  it.each([
    [{ no_fap: booleanResponse(false) }, 6],
    [{ hydration: numericResponse(2.99) }, 6],
    [{ steps: undefined }, 6],
  ])("one non-pass prevents perfection", (override, completed) => {
    const responses = { ...allPassingResponses(), ...override } as Record<
      string,
      DailyQuestResponse
    >;
    if (responses.steps === undefined) delete responses.steps;
    expect(evaluateDailyQuest(input(responses))).toMatchObject({
      status: "IN_PROGRESS",
      completedRequiredRules: completed,
      isPerfectDay: false,
    });
  });

  it.each([
    [1, 14.285714285714286],
    [3, 42.857142857142854],
    [6, 85.71428571428571],
  ])("calculates %s of seven with full precision", (count, percent) => {
    const entries = Object.entries(allPassingResponses()).slice(0, count);
    const result = evaluateDailyQuest(input(Object.fromEntries(entries)));
    expect(result.completedRequiredRules).toBe(count);
    expect(result.rawCompletionPercent).toBeCloseTo(percent);
    expect(result.completionPercent).toBeCloseTo(percent);
  });

  it("workout absence cannot affect perfection because it is not in the snapshot", () => {
    const result = evaluateDailyQuest(input(allPassingResponses()));
    expect(result.rules.some((rule) => rule.key === "workout")).toBe(false);
    expect(result.isPerfectDay).toBe(true);
  });

  it("sorts the immutable snapshot for display without mutating it", () => {
    const reversed = [...rules].reverse();
    const before = structuredClone(reversed);
    const result = evaluateDailyQuest(input({}, { rules: reversed }));
    expect(result.rules.map((rule) => rule.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(reversed).toEqual(before);
  });
});
