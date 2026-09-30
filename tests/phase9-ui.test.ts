import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AchievementDashboard } from "@/components/achievements/achievement-dashboard";
import { RecoveryPanel } from "@/components/recovery/recovery-panel";
import { RewardsDashboard } from "@/components/rewards/rewards-dashboard";

describe("Phase 9 UI", () => {
  it("renders unlocked and locked achievements with earned title controls", () => {
    const base = {
      name: "FIRST CLEAR",
      description: "Complete the first Perfect Day.",
      category: "DISCIPLINE" as const,
      current: 1,
      target: 1,
      progressPercent: 100,
      unlockedAt: "2026-10-01T00:00:00.000Z",
    };
    const markup = renderToStaticMarkup(
      createElement(AchievementDashboard, {
        initialSummary: {
          kind: "AVAILABLE",
          selectedTitle: "SYSTEM INITIATE",
          titles: ["SYSTEM INITIATE"],
          unlocked: [
            {
              ...base,
              key: "FIRST_CLEAR",
              status: "ACTIVE",
              titleReward: "SYSTEM INITIATE",
            },
          ],
          locked: [
            {
              ...base,
              key: "PERFECT_WEEK",
              name: "PERFECT WEEK",
              current: 0,
              progressPercent: 0,
              status: "LOCKED",
              titleReward: null,
              unlockedAt: null,
            },
          ],
        },
      }),
    );
    expect(markup).toContain("SYSTEM INITIATE");
    expect(markup).toContain("ACHIEVEMENT ARCHIVE");
    expect(markup).toContain("PERFECT WEEK");
  });

  it("explains constructive recovery without penalty language", () => {
    const markup = renderToStaticMarkup(
      createElement(RecoveryPanel, {
        summary: {
          kind: "AVAILABLE",
          configuredWorkoutTarget: 4,
          history: [],
          active: [
            {
              type: "DAILY_RECOVERY",
              status: "ACTIVE",
              failureCount: 2,
              triggerDate: "2026-10-02",
              challengeWeek: null,
              requirementType: "FUTURE_PERFECT_DAY",
              targetDate: null,
              targetWeek: null,
              assignedAt: "2026-10-03T00:00:00.000Z",
              completedAt: null,
            },
          ],
        },
      }),
    );
    expect(markup).toContain("RECOVERY MODE");
    expect(markup).toContain("one future Perfect Day");
    expect(markup).toContain("No negative XP");
  });

  it("renders the reward archive and explicit personal-reward boundary", () => {
    const markup = renderToStaticMarkup(
      createElement(RewardsDashboard, {
        summary: {
          kind: "AVAILABLE",
          counts: { dailyClears: 1, perfectWeeks: 0, workoutWeeks: 0, milestones: 0 },
          personalRewards: [],
          recent: [
            {
              type: "DAILY_CLEAR",
              key: "daily-clear:2026-10-01",
              title: "DAILY CLEAR",
              description: "Clear mark.",
              challengeDay: 1,
              challengeWeek: null,
              grantedAt: "2026-10-01T00:00:00.000Z",
              claimedAt: null,
            },
          ],
        },
      }),
    );
    expect(markup).toContain("DAILY CLEAR");
    expect(markup).toContain("NOT IMPLEMENTED");
  });
});
