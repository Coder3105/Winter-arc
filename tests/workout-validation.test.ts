import { describe, expect, it } from "vitest";

import { workoutIdSchema, workoutInputSchema } from "@/lib/validation/workout";

describe("workout validation", () => {
  it("normalizes a valid completed session input", () => {
    expect(
      workoutInputSchema.parse({
        type: "STRENGTH",
        title: " Push Day ",
        durationMinutes: 65,
      }),
    ).toEqual({
      type: "STRENGTH",
      title: "Push Day",
      durationMinutes: 65,
      notes: null,
    });
  });

  it.each([
    { type: "YOGA", durationMinutes: 60 },
    { type: "CARDIO", durationMinutes: 0 },
    { type: "CARDIO", durationMinutes: 1.5 },
    { type: "CARDIO", durationMinutes: 1_441 },
    { type: "CARDIO", durationMinutes: Infinity },
  ])("rejects invalid input %#", (input) => {
    expect(workoutInputSchema.safeParse(input).success).toBe(false);
  });

  it("accepts only MongoDB object IDs for correction routes", () => {
    expect(workoutIdSchema.safeParse("507f1f77bcf86cd799439011").success).toBe(true);
    expect(workoutIdSchema.safeParse("not-an-id").success).toBe(false);
  });
});
