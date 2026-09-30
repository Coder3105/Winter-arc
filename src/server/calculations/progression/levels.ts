import { CalculationError, integer } from "../common/validation";

export interface LevelProgress {
  readonly level: number;
  readonly totalXp: number;
  readonly currentLevelStartXp: number;
  readonly nextLevelXp: number;
  readonly xpIntoCurrentLevel: number;
  readonly xpRequiredForNextLevel: number;
  readonly levelProgressPercent: number;
}

export function getXpRequiredForNextLevel(level: number): number {
  integer(level, "level", 1);
  const result = 100 + 20 * (level - 1);
  if (!Number.isSafeInteger(result))
    throw new CalculationError("level", "produces an unsafe XP requirement.");
  return result;
}

export function getCumulativeXpForLevel(level: number): number {
  integer(level, "level", 1);
  const n = BigInt(level - 1);
  const result = 10n * n * n + 90n * n;
  if (result > BigInt(Number.MAX_SAFE_INTEGER))
    throw new CalculationError("level", "produces an unsafe cumulative XP value.");
  return Number(result);
}

export function calculateLevelFromXp(totalXp: number): number {
  integer(totalXp, "totalXp", 0);
  const estimate = Math.floor((-90 + Math.sqrt(8_100 + 40 * totalXp)) / 20) + 1;
  let level = Math.max(1, estimate);
  while (level > 1 && getCumulativeXpForLevel(level) > totalXp) level -= 1;
  while (getCumulativeXpForLevel(level + 1) <= totalXp) level += 1;
  return level;
}

export function calculateLevelProgress(totalXp: number): LevelProgress {
  const level = calculateLevelFromXp(totalXp);
  const currentLevelStartXp = getCumulativeXpForLevel(level);
  const nextLevelXp = getCumulativeXpForLevel(level + 1);
  const xpRequiredForNextLevel = nextLevelXp - currentLevelStartXp;
  const xpIntoCurrentLevel = totalXp - currentLevelStartXp;
  return {
    level,
    totalXp,
    currentLevelStartXp,
    nextLevelXp,
    xpIntoCurrentLevel,
    xpRequiredForNextLevel,
    levelProgressPercent: (xpIntoCurrentLevel / xpRequiredForNextLevel) * 100,
  };
}
