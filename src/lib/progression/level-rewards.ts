export type LevelRewardSoldier = "beru" | "igris" | "iron";

export type JourneyRank = "E" | "D" | "C" | "B" | "A" | "S" | "S+";

export const LEVEL_REWARD_MILESTONES = [
  {
    level: 5,
    title: "LEVEL 5 MILESTONE",
    description: "First ascent emblem",
    soldier: "beru",
  },
  {
    level: 10,
    title: "LEVEL 10 MILESTONE",
    description: "Discipline crest",
    soldier: "igris",
  },
  {
    level: 15,
    title: "LEVEL 15 MILESTONE",
    description: "Mid-arc sigil",
    soldier: "iron",
  },
  {
    level: 20,
    title: "LEVEL 20 MILESTONE",
    description: "Ascendant emblem",
    soldier: "beru",
  },
  {
    level: 25,
    title: "LEVEL 25 MILESTONE",
    description: "Elite crest",
    soldier: "igris",
  },
  {
    level: 30,
    title: "LEVEL 30 MILESTONE",
    description: "Apex sigil",
    soldier: "iron",
  },
] as const satisfies readonly {
  readonly level: number;
  readonly title: string;
  readonly description: string;
  readonly soldier: LevelRewardSoldier;
}[];

export function xpRequiredForLevel(level: number) {
  const completedLevels = level - 1;
  return 10 * completedLevels * completedLevels + 90 * completedLevels;
}

export function rankForJourneyLevel(level: number): JourneyRank {
  if (level >= 31) return "S+";
  if (level >= 26) return "S";
  if (level >= 21) return "A";
  if (level >= 16) return "B";
  if (level >= 11) return "C";
  if (level >= 6) return "D";
  return "E";
}
