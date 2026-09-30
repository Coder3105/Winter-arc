import { integer } from "../common/validation";

export const SYSTEM_RANKS = ["E", "D", "C", "B", "A", "S", "S+"] as const;
export type SystemRank = (typeof SYSTEM_RANKS)[number];

export interface RankProgress {
  readonly currentRank: SystemRank;
  readonly nextRank: SystemRank | null;
  readonly levelsUntilNextRank: number | null;
}

export function getRankForLevel(level: number): SystemRank {
  integer(level, "level", 1);
  if (level >= 31) return "S+";
  return SYSTEM_RANKS[Math.floor((level - 1) / 5)]!;
}

export function getNextRank(level: number): RankProgress {
  const currentRank = getRankForLevel(level);
  if (currentRank === "S+") {
    return { currentRank, nextRank: null, levelsUntilNextRank: null };
  }
  const nextRank = SYSTEM_RANKS[SYSTEM_RANKS.indexOf(currentRank) + 1]!;
  const nextRankStartLevel = (SYSTEM_RANKS.indexOf(currentRank) + 1) * 5 + 1;
  return {
    currentRank,
    nextRank,
    levelsUntilNextRank: nextRankStartLevel - level,
  };
}
