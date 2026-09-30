import { describe, expect, it } from "vitest";

import { dailyQuestResponseInputSchema } from "@/lib/validation/daily-quest";

describe("Daily Quest update validation", () => {
  it.each([true, false, 0, 2.5, 10_000])("accepts supported raw value %s", (value) => {
    expect(
      dailyQuestResponseInputSchema.safeParse({ key: "hydration", value }).success,
    ).toBe(true);
  });
  it.each([-1, NaN, Infinity, -Infinity, null, "2.5", {}, []])(
    "rejects invalid raw value %s",
    (value) => {
      expect(
        dailyQuestResponseInputSchema.safeParse({ key: "hydration", value }).success,
      ).toBe(false);
    },
  );
  it.each(["", "Bad Key", "$where", "a".repeat(61)])("rejects unsafe key %s", (key) => {
    expect(dailyQuestResponseInputSchema.safeParse({ key, value: true }).success).toBe(
      false,
    );
  });
});
