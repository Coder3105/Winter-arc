import { describe, expect, it } from "vitest";

import { weightHistoryRangeSchema, weightInputSchema } from "@/lib/validation/weight";

describe("weight validation", () => {
  it.each([20, 108, 108.5, 108.55, 500])("accepts structural weight %s", (weightKg) => {
    expect(weightInputSchema.parse({ weightKg })).toEqual({ weightKg });
  });

  it.each([0, -1, 19.99, 500.01, Infinity, NaN])(
    "rejects invalid weight %s",
    (weightKg) => {
      expect(weightInputSchema.safeParse({ weightKg }).success).toBe(false);
    },
  );

  it("validates ordered real calendar ranges", () => {
    expect(
      weightHistoryRangeSchema.safeParse({ from: "2026-09-01", to: "2026-09-30" })
        .success,
    ).toBe(true);
    expect(
      weightHistoryRangeSchema.safeParse({ from: "2026-09-30", to: "2026-09-01" })
        .success,
    ).toBe(false);
    expect(
      weightHistoryRangeSchema.safeParse({ from: "2026-02-30", to: "2026-09-01" })
        .success,
    ).toBe(false);
  });
});
