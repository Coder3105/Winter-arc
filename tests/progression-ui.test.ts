import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ProgressionIdentity,
  ProgressionStatus,
} from "@/components/progression/progression-status";

const summary = {
  kind: "AVAILABLE" as const,
  localDate: "2026-09-30",
  challengeStatus: "ACTIVE" as const,
  totalXp: 430,
  level: {
    current: 4,
    currentLevelStartXp: 360,
    nextLevelXp: 520,
    xpIntoLevel: 70,
    xpRequired: 160,
    xpRemaining: 90,
    progressPercent: 43.75,
    nextLevel: 5,
  },
  rank: { current: "E" as const, next: "D" as const, levelsUntilNextRank: 2 },
  systemRecord: {
    selectedTitle: "SYSTEM INITIATE",
    achievementCount: 3,
    latestAchievement: {
      key: "FIRST_CLEAR" as const,
      name: "FIRST CLEAR" as const,
    },
    activeRecovery: [],
    dailyClearCount: 3,
    perfectWeekCount: 0,
    weeklyMissionRewardCount: 1,
  },
  today: {
    totalXp: 120,
    dailyQuestXp: 120,
    maxAvailableDailyQuestXp: 120,
    workoutDayXp: 0,
  },
  week: { challengeWeek: 1, xp: 430 },
  breakdown: {
    dailyRules: 285,
    perfectDays: 75,
    workoutDays: 60,
    weeklyWorkoutBonuses: 10,
  },
  recentEvents: [
    {
      sourceType: "DAILY_RULE" as const,
      eventType: "DAILY_RULE_PASSED" as const,
      label: "NO JUNK FOOD",
      xp: 20,
      sourceDate: "2026-09-30",
      challengeDay: 1,
      challengeWeek: 1,
      earnedAt: "2026-09-30T01:00:00Z",
    },
  ],
};

describe("progression UI", () => {
  it("renders compact level, rank, total, accessible level bar, and status link", () => {
    const markup = renderToStaticMarkup(
      createElement(ProgressionStatus, { initialSummary: summary }),
    );
    expect(markup).toContain("SYSTEM STATUS");
    expect(markup).toContain("LEVEL");
    expect(markup).toContain("RANK");
    expect(markup).toContain("430");
    expect(markup).toContain("70");
    expect(markup).toContain("160 XP");
    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain('href="/status"');
  });

  it("renders the full status breakdown and gamification disclaimer", () => {
    const markup = renderToStaticMarkup(
      createElement(ProgressionStatus, { initialSummary: summary, full: true }),
    );
    expect(markup).toContain("PROGRESSION SOURCES");
    expect(markup).toContain("DAILY QUESTS");
    expect(markup).toContain("WEEKLY MISSIONS");
    expect(markup).toContain("NO JUNK FOOD");
    expect(markup).toContain("+20 XP");
    expect(markup).toContain("LEVEL PATH");
    expect(markup).toContain("CURRENT");
    expect(markup).toContain("NEXT");
    expect(markup).toContain("Inspect reward at level 5");
    expect(markup).toContain("beru.png");
    expect(markup).toContain("igris.png");
    expect(markup).toContain("iron.png");
    expect(markup).toContain("GAMIFICATION ONLY");
  });

  it("keeps Profile integration compact", () => {
    const markup = renderToStaticMarkup(createElement(ProgressionIdentity, { summary }));
    expect(markup).toContain("SYSTEM IDENTITY");
    expect(markup).toContain("VIEW SYSTEM STATUS");
    expect(markup).not.toContain("RECENT ACTIVITY");
  });
});
