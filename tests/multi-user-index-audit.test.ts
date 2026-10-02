import { describe, expect, it } from "vitest";
import type { Model } from "mongoose";
import { UserProfileModel } from "@/server/models/user-profile";
import { BodyCompositionAssessmentModel } from "@/server/models/body-composition-assessment";
import { DailyQuestRecordModel } from "@/server/models/daily-quest-record";
import { WorkoutRecordModel } from "@/server/models/workout-record";
import { WeightRecordModel } from "@/server/models/weight-record";
import { ProgressionEventModel } from "@/server/models/progression-event";
import { AchievementUnlockModel } from "@/server/models/achievement-unlock";
import { RewardGrantModel } from "@/server/models/reward-grant";
import { RecoveryProtocolModel } from "@/server/models/recovery-protocol";
import { WeeklyReportModel } from "@/server/models/weekly-report";
import { NotificationPreferencesModel } from "@/server/models/notification-preferences";
import { NotificationRecordModel } from "@/server/models/notification-record";
import { PushSubscriptionRecordModel } from "@/server/models/push-subscription-record";

function namedUnique(model: Model<unknown>, name: string) {
  return model.schema
    .indexes()
    .find(([, options]) => options.name === name && options.unique === true)?.[0];
}

describe("multi-user unique-index audit", () => {
  it.each([
    [
      DailyQuestRecordModel,
      "unique_daily_quest_per_protocol",
      { userId: 1, winterArcConfigId: 1, date: 1 },
    ],
    [
      WeightRecordModel,
      "unique_weight_per_protocol_day",
      { userId: 1, winterArcConfigId: 1, date: 1 },
    ],
    [
      ProgressionEventModel,
      "unique_progression_source",
      { userId: 1, winterArcConfigId: 1, sourceType: 1, sourceKey: 1 },
    ],
    [
      AchievementUnlockModel,
      "unique_achievement_unlock",
      { userId: 1, winterArcConfigId: 1, achievementKey: 1, achievementVersion: 1 },
    ],
    [
      RewardGrantModel,
      "unique_reward_grant",
      { userId: 1, winterArcConfigId: 1, rewardType: 1, rewardKey: 1 },
    ],
    [
      RecoveryProtocolModel,
      "unique_recovery_source",
      { userId: 1, winterArcConfigId: 1, type: 1, sourceKey: 1 },
    ],
    [
      WeeklyReportModel,
      "unique_final_weekly_report",
      { userId: 1, winterArcConfigId: 1, challengeWeek: 1, reportPolicyVersion: 1 },
    ],
    [
      NotificationRecordModel,
      "unique_notification_dedupe",
      { userId: 1, winterArcConfigId: 1, dedupeKey: 1, policyVersion: 1 },
    ],
  ] as const)("%s includes the user in %s", (model, name, fields) => {
    expect(namedUnique(model as unknown as Model<unknown>, name)).toEqual(fields);
  });

  it("keeps one profile and preference record per user, not globally", () => {
    expect(UserProfileModel.schema.path("userId")?.options.unique).toBe(true);
    expect(
      namedUnique(
        NotificationPreferencesModel as unknown as Model<unknown>,
        "unique_notification_preferences",
      ),
    ).toEqual({ userId: 1 });
  });

  it("allows multiple users to share dates and multiple workout sessions per user/date", () => {
    expect(
      namedUnique(
        DailyQuestRecordModel as unknown as Model<unknown>,
        "unique_daily_quest_per_protocol",
      ),
    ).toHaveProperty("userId", 1);
    expect(
      namedUnique(
        WeightRecordModel as unknown as Model<unknown>,
        "unique_weight_per_protocol_day",
      ),
    ).toHaveProperty("userId", 1);
    const workout = WorkoutRecordModel.schema
      .indexes()
      .find(([, options]) => options.name === "workout_owner_protocol_date");
    expect(workout?.[0]).toEqual({ userId: 1, winterArcConfigId: 1, date: 1 });
    expect(workout?.[1].unique).not.toBe(true);
  });

  it("scopes body baselines by user/config and deliberately keeps endpoint hashes global", () => {
    const baseline = BodyCompositionAssessmentModel.schema
      .indexes()
      .find(([, options]) => options.unique === true);
    expect(baseline?.[0]).toEqual({ userId: 1, winterArcConfigId: 1, isBaseline: 1 });
    expect(
      namedUnique(
        PushSubscriptionRecordModel as unknown as Model<unknown>,
        "unique_push_endpoint_hash",
      ),
    ).toEqual({ endpointHash: 1 });
  });
});
