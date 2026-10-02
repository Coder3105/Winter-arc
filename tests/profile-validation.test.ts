import { describe, expect, it } from "vitest";

import { profileInputSchema } from "@/lib/validation/profile";

const validProfile = {
  displayName: "Nivedan",
  dateOfBirth: null,
  ageAtBaseline: 24,
  sex: "male" as const,
  heightCm: 178,
  preferredWeightUnit: "kg" as const,
  preferredDistanceUnit: "km" as const,
  timezone: "Asia/Kolkata",
};

describe("profile validation", () => {
  it("accepts the Phase 2 owner profile", () => {
    expect(profileInputSchema.parse(validProfile)).toEqual(validProfile);
  });

  it("rejects non-positive height", () => {
    expect(() => profileInputSchema.parse({ ...validProfile, heightCm: 0 })).toThrow();
  });

  it("allows optional physical fields to remain unavailable", () => {
    expect(
      profileInputSchema.safeParse({
        ...validProfile,
        ageAtBaseline: null,
        sex: null,
        heightCm: null,
      }).success,
    ).toBe(true);
  });
});
