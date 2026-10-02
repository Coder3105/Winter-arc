import { describe, expect, it } from "vitest";

import {
  LEVEL_REWARD_MILESTONES,
  rankForJourneyLevel,
  xpRequiredForLevel,
} from "@/lib/progression/level-rewards";

describe("level journey reward policy", () => {
  it("shares the six existing reward thresholds with rotating shadow artwork", () => {
    expect(LEVEL_REWARD_MILESTONES.map((reward) => reward.level)).toEqual([
      5, 10, 15, 20, 25, 30,
    ]);
    expect(LEVEL_REWARD_MILESTONES.map((reward) => reward.soldier)).toEqual([
      "beru",
      "igris",
      "iron",
      "beru",
      "igris",
      "iron",
    ]);
  });

  it("uses the authoritative cumulative level XP equation", () => {
    expect(xpRequiredForLevel(1)).toBe(0);
    expect(xpRequiredForLevel(5)).toBe(520);
    expect(xpRequiredForLevel(30)).toBe(11_020);
  });

  it("shows the authoritative rank band for every journey level", () => {
    expect([1, 6, 11, 16, 21, 26, 31].map(rankForJourneyLevel)).toEqual([
      "E",
      "D",
      "C",
      "B",
      "A",
      "S",
      "S+",
    ]);
  });
});
