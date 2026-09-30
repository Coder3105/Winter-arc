import { describe, expect, it } from "vitest";

import {
  calculateLevelFromXp,
  calculateLevelProgress,
  CalculationError,
  getCumulativeXpForLevel,
  getNextRank,
  getRankForLevel,
  getXpRequiredForNextLevel,
} from "@/server/calculations";

describe("progression level calculations", () => {
  it.each([
    [1, 0],
    [2, 100],
    [3, 220],
    [4, 360],
    [5, 520],
    [17, 4_000],
  ])("resolves the cumulative threshold for level %i", (level, xp) => {
    expect(getCumulativeXpForLevel(level)).toBe(xp);
  });

  it.each([
    [0, 1],
    [99, 1],
    [100, 2],
    [219, 2],
    [220, 3],
    [359, 3],
    [360, 4],
    [519, 4],
    [520, 5],
    [4_000, 17],
  ])("maps %i XP to level %i", (xp, level) => {
    expect(calculateLevelFromXp(xp)).toBe(level);
  });

  it("returns deterministic current-level progress", () => {
    expect(calculateLevelProgress(430)).toEqual({
      level: 4,
      totalXp: 430,
      currentLevelStartXp: 360,
      nextLevelXp: 520,
      xpIntoCurrentLevel: 70,
      xpRequiredForNextLevel: 160,
      levelProgressPercent: 43.75,
    });
    expect(getXpRequiredForNextLevel(4)).toBe(160);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 1.5])(
    "rejects invalid XP %s",
    (xp) => expect(() => calculateLevelProgress(xp)).toThrow(CalculationError),
  );

  it.each([0, -1, 1.5, Number.NaN])("rejects invalid level %s", (level) => {
    expect(() => getCumulativeXpForLevel(level)).toThrow(CalculationError);
  });
});

describe("System rank calculations", () => {
  it.each([
    [1, "E"],
    [5, "E"],
    [6, "D"],
    [10, "D"],
    [11, "C"],
    [15, "C"],
    [16, "B"],
    [20, "B"],
    [21, "A"],
    [25, "A"],
    [26, "S"],
    [30, "S"],
    [31, "S+"],
    [100, "S+"],
  ] as const)("maps level %i to rank %s", (level, rank) => {
    expect(getRankForLevel(level)).toBe(rank);
  });

  it("describes the next rank without capping S+ levels", () => {
    expect(getNextRank(18)).toEqual({
      currentRank: "B",
      nextRank: "A",
      levelsUntilNextRank: 3,
    });
    expect(getNextRank(100)).toEqual({
      currentRank: "S+",
      nextRank: null,
      levelsUntilNextRank: null,
    });
  });
});
