import "server-only";

import {
  ACHIEVEMENT_DEFINITIONS,
  ACHIEVEMENT_POLICY_VERSION,
  getAchievementDefinition,
  SYSTEM_TITLES,
  type SystemTitle,
} from "@/server/achievements/achievement-policy";
import {
  addCalendarDays,
  buildRecoveryEpisodes,
  calculateChallengeDay,
  calculateLevelFromXp,
  calendarDayIndex,
  evaluateAchievementProgress,
  getFinalizedPerfectWeeks,
  getChallengeWeekBounds,
  longestConsecutiveCalendarRun,
  longestConsecutiveIntegerRun,
  normalizeCalendarDate,
  type AchievementMetrics,
} from "@/server/calculations";
import { LEVEL_REWARD_MILESTONES } from "@/lib/progression/level-rewards";
import { connectToDatabase } from "@/server/db/mongoose";
import { AppError } from "@/server/errors/app-error";
import { AchievementUnlockModel } from "@/server/models/achievement-unlock";
import { DailyQuestRecordModel } from "@/server/models/daily-quest-record";
import {
  ProgressionEventModel,
  type ProgressionEventDocument,
} from "@/server/models/progression-event";
import {
  RecoveryProtocolModel,
  type RecoveryProtocolDocument,
} from "@/server/models/recovery-protocol";
import { RewardGrantModel, type RewardType } from "@/server/models/reward-grant";
import { UserProfileModel } from "@/server/models/user-profile";
import { WeightRecordModel } from "@/server/models/weight-record";
import { WorkoutRecordModel } from "@/server/models/workout-record";

import { getProfile } from "./profile-service";
import { getWinterArcConfig, type WinterArcConfigDto } from "./winter-arc-service";

const REWARD_VERSION = 1;

interface Phase9Context {
  readonly profile: NonNullable<Awaited<ReturnType<typeof getProfile>>>;
  readonly config: WinterArcConfigDto;
  readonly currentDate: string;
  readonly challenge: ReturnType<typeof calculateChallengeDay>;
  readonly progressionEvents: readonly ProgressionEventDocument[];
  readonly questDates: readonly string[];
  readonly questRecords: readonly {
    readonly date: string;
    readonly ruleKeys: readonly string[];
  }[];
  readonly workoutRecords: readonly {
    readonly date: string;
    readonly challengeWeek: number;
  }[];
  readonly weightCount: number;
}

function duplicateKey(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

async function loadContext(userId: string, now: Date): Promise<Phase9Context | null> {
  const [profile, config] = await Promise.all([
    getProfile(userId),
    getWinterArcConfig(userId),
  ]);
  if (!profile || !config || config.status !== "ACTIVE") return null;
  const currentDate = normalizeCalendarDate(now, profile.timezone);
  const challenge = calculateChallengeDay({
    startDate: config.startDate,
    currentDate,
    timezone: profile.timezone,
    durationDays: config.durationDays,
  });
  await connectToDatabase();
  const [progressionEvents, quests, workoutRecords, weightCount] = await Promise.all([
    ProgressionEventModel.find({
      userId,
      winterArcConfigId: config.id,
      status: "ACTIVE",
    }),
    DailyQuestRecordModel.find({
      userId,
      winterArcConfigId: config.id,
      date: { $gte: config.startDate, $lte: config.endDate },
    }).sort({ date: 1 }),
    WorkoutRecordModel.find({
      userId,
      winterArcConfigId: config.id,
      status: "COMPLETED",
    }).sort({ date: 1 }),
    WeightRecordModel.countDocuments({ userId, winterArcConfigId: config.id }),
  ]);
  return {
    profile,
    config,
    currentDate,
    challenge,
    progressionEvents,
    questDates: quests.map((quest) => quest.date),
    questRecords: quests.map((quest) => ({
      date: quest.date,
      ruleKeys: quest.ruleSnapshot.map((rule) => rule.key),
    })),
    workoutRecords: workoutRecords.map((record) => ({
      date: record.date,
      challengeWeek: record.challengeWeek,
    })),
    weightCount,
  };
}

function datesForRule(events: readonly ProgressionEventDocument[], key: string) {
  return events
    .filter(
      (event) =>
        event.sourceType === "DAILY_RULE" &&
        event.sourceKey.endsWith(`:${key}`) &&
        event.sourceDate,
    )
    .map((event) => event.sourceDate!);
}

function longestEligibleRuleRun(context: Phase9Context, key: string) {
  const passed = new Set(datesForRule(context.progressionEvents, key));
  let longest = 0;
  let running = 0;
  for (const record of context.questRecords) {
    if (!record.ruleKeys.includes(key)) continue;
    running = passed.has(record.date) ? running + 1 : 0;
    longest = Math.max(longest, running);
  }
  return longest;
}

function buildMetrics(context: Phase9Context) {
  const perfectDates = context.progressionEvents
    .filter((event) => event.sourceType === "PERFECT_DAY" && event.sourceDate)
    .map((event) => event.sourceDate!);
  const securedWeeks = context.progressionEvents
    .filter((event) => event.sourceType === "WEEKLY_WORKOUT" && event.challengeWeek)
    .map((event) => event.challengeWeek!);
  const totalXp = context.progressionEvents.reduce((sum, event) => sum + event.xp, 0);
  const level = calculateLevelFromXp(totalXp);
  const perfectWeeks = getFinalizedPerfectWeeks({
    challengeStartDate: context.config.startDate,
    durationDays: context.config.durationDays,
    currentDate: context.currentDate,
    perfectDates,
  });
  const day30End = addCalendarDays(context.config.startDate, 29);
  const day60End = addCalendarDays(context.config.startDate, 59);
  const day30Participation = context.questDates.some((date) => date <= day30End);
  const day60Participation = context.questDates.some((date) => date <= day60End);
  const anyTracked =
    context.questDates.length + context.workoutRecords.length + context.weightCount > 0;
  const metrics: AchievementMetrics = {
    perfectDays: perfectDates.length,
    perfectStreak: longestConsecutiveCalendarRun(perfectDates),
    hydrationStreak: longestEligibleRuleRun(context, "hydration"),
    sleepStreak: longestEligibleRuleRun(context, "sleep"),
    noJunkStreak: longestEligibleRuleRun(context, "no_junk_food"),
    noFapStreak: longestEligibleRuleRun(context, "no_fap"),
    stepsStreak: longestEligibleRuleRun(context, "steps"),
    securedWorkoutWeeks: new Set(securedWeeks).size,
    workoutWeekStreak: longestConsecutiveIntegerRun(securedWeeks),
    level,
    day30Active: context.challenge.dayNumber >= 30 && day30Participation ? 1 : 0,
    day60Active: context.challenge.dayNumber >= 60 && day60Participation ? 1 : 0,
    day90Complete: context.challenge.status === "COMPLETED" && anyTracked ? 1 : 0,
    perfectWeeks: perfectWeeks.length,
  };
  return {
    metrics,
    progress: evaluateAchievementProgress(metrics),
    perfectDates,
    securedWeeks,
    perfectWeeks,
    level,
  };
}

async function convergeAchievement(
  userId: string,
  configId: string,
  item: ReturnType<typeof evaluateAchievementProgress>[number],
  now: Date,
) {
  const filter = {
    userId,
    winterArcConfigId: configId,
    achievementKey: item.key,
    achievementVersion: ACHIEVEMENT_POLICY_VERSION,
  };
  if (!item.qualified) {
    await AchievementUnlockModel.findOneAndUpdate(
      { ...filter, status: "ACTIVE" },
      {
        $set: {
          status: "REVOKED",
          revokedAt: now,
          metadata: { current: item.current, target: item.target },
        },
      },
    );
    return;
  }
  try {
    await AchievementUnlockModel.findOneAndUpdate(
      filter,
      {
        $setOnInsert: {
          ...filter,
          category: item.category,
          unlockedAt: now,
          sourceType: "DERIVED_POLICY",
          sourceKey: item.key,
          challengeDay: null,
          challengeWeek: null,
        },
        $set: {
          status: "ACTIVE",
          revokedAt: null,
          metadata: { current: item.current, target: item.target },
        },
      },
      { upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    if (!duplicateKey(error)) throw error;
    await AchievementUnlockModel.updateOne(filter, {
      $set: { status: "ACTIVE", revokedAt: null },
    });
  }
}

async function reconcileAchievements(
  userId: string,
  context: Phase9Context,
  derived: ReturnType<typeof buildMetrics>,
  now: Date,
) {
  await AchievementUnlockModel.init();
  await Promise.all(
    derived.progress.map((item) =>
      convergeAchievement(userId, context.config.id, item, now),
    ),
  );
  if (context.profile.selectedTitle) {
    const active = await AchievementUnlockModel.find({
      userId,
      winterArcConfigId: context.config.id,
      status: "ACTIVE",
    });
    const validTitles = new Set(
      active.flatMap((unlock) => {
        const definition = getAchievementDefinition(unlock.achievementKey);
        return definition && "titleReward" in definition ? [definition.titleReward] : [];
      }),
    );
    if (!validTitles.has(context.profile.selectedTitle as SystemTitle))
      await UserProfileModel.updateOne({ userId }, { $set: { selectedTitle: null } });
  }
}

interface DesiredReward {
  readonly rewardType: RewardType;
  readonly rewardKey: string;
  readonly sourceType: string;
  readonly sourceKey: string;
  readonly title: string;
  readonly description: string;
  readonly challengeDay?: number;
  readonly challengeWeek?: number;
}

async function convergeReward(
  userId: string,
  configId: string,
  reward: DesiredReward,
  active: boolean,
  now: Date,
) {
  const filter = {
    userId,
    winterArcConfigId: configId,
    rewardType: reward.rewardType,
    rewardKey: reward.rewardKey,
  };
  if (!active) {
    await RewardGrantModel.findOneAndUpdate(
      { ...filter, status: "ACTIVE", claimedAt: null },
      { $set: { status: "REVOKED", revokedAt: now } },
    );
    return;
  }
  try {
    await RewardGrantModel.findOneAndUpdate(
      filter,
      {
        $setOnInsert: {
          ...filter,
          sourceType: reward.sourceType,
          sourceKey: reward.sourceKey,
          grantedAt: now,
          claimedAt: null,
          title: reward.title,
          description: reward.description,
          rewardVersion: REWARD_VERSION,
          challengeDay: reward.challengeDay ?? null,
          challengeWeek: reward.challengeWeek ?? null,
        },
        $set: { status: "ACTIVE", revokedAt: null },
      },
      { upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    if (!duplicateKey(error)) throw error;
    await RewardGrantModel.updateOne(filter, {
      $set: { status: "ACTIVE", revokedAt: null },
    });
  }
}

function desiredRewards(
  context: Phase9Context,
  derived: ReturnType<typeof buildMetrics>,
): DesiredReward[] {
  const startIndex = calendarDayIndex(context.config.startDate);
  return [
    ...derived.perfectDates.map((date) => ({
      rewardType: "DAILY_CLEAR" as const,
      rewardKey: `daily-clear:${date}`,
      sourceType: "PERFECT_DAY",
      sourceKey: `perfect-day:${date}`,
      title: "DAILY CLEAR",
      description: "All required Daily Quest rules cleared. System clear mark granted.",
      challengeDay: calendarDayIndex(date) - startIndex + 1,
    })),
    ...derived.perfectWeeks.map((week) => ({
      rewardType: "PERFECT_WEEK" as const,
      rewardKey: `perfect-week:${week}`,
      sourceType: "PERFECT_WEEK",
      sourceKey: `perfect-week:${week}`,
      title: "WEEK PERFECT",
      description: "7 / 7 Daily Quest days cleared. System emblem granted.",
      challengeWeek: week,
    })),
    ...[...new Set(derived.securedWeeks)].map((week) => ({
      rewardType: "WORKOUT_WEEK" as const,
      rewardKey: `workout-week-secured:${week}`,
      sourceType: "WEEKLY_WORKOUT",
      sourceKey: `workout-week:${week}:secured`,
      title: "TRAINING PROTOCOL SECURED",
      description: "Configured weekly workout mission cleared.",
      challengeWeek: week,
    })),
    ...LEVEL_REWARD_MILESTONES.filter(({ level }) => derived.level >= level).map(
      ({ level }) => ({
        rewardType: "LEVEL_MILESTONE" as const,
        rewardKey: `level:${level}`,
        sourceType: "PROGRESSION_LEVEL",
        sourceKey: `level:${level}`,
        title: `LEVEL ${level} MILESTONE`,
        description: "Digital System emblem unlocked.",
      }),
    ),
  ];
}

async function reconcileRewards(
  userId: string,
  context: Phase9Context,
  derived: ReturnType<typeof buildMetrics>,
  now: Date,
) {
  await RewardGrantModel.init();
  const desired = desiredRewards(context, derived);
  const desiredKeys = new Set(
    desired.map((reward) => `${reward.rewardType}:${reward.rewardKey}`),
  );
  const existing = await RewardGrantModel.find({
    userId,
    winterArcConfigId: context.config.id,
  });
  await Promise.all([
    ...desired.map((reward) =>
      convergeReward(userId, context.config.id, reward, true, now),
    ),
    ...existing
      .filter((reward) => !desiredKeys.has(`${reward.rewardType}:${reward.rewardKey}`))
      .map((reward) =>
        convergeReward(
          userId,
          context.config.id,
          {
            rewardType: reward.rewardType,
            rewardKey: reward.rewardKey,
            sourceType: reward.sourceType,
            sourceKey: reward.sourceKey,
            title: reward.title,
            description: reward.description,
          },
          false,
          now,
        ),
      ),
  ]);
}

interface DesiredRecovery {
  readonly type: "DAILY_RECOVERY" | "WORKOUT_RECOVERY";
  readonly triggerKeys: readonly string[];
  readonly clearingKey: string | null;
}

async function convergeRecovery(
  userId: string,
  configId: string,
  desired: DesiredRecovery,
  existing: RecoveryProtocolDocument | undefined,
  now: Date,
) {
  const first = desired.triggerKeys[0]!;
  const last = desired.triggerKeys.at(-1)!;
  const filter = {
    userId,
    winterArcConfigId: configId,
    type: desired.type,
    sourceKey: `${desired.type.toLowerCase()}:${first}`,
  };
  const completed = desired.clearingKey !== null;
  const set = {
    triggerKeys: [...desired.triggerKeys],
    failureCount: desired.triggerKeys.length,
    triggerDate: desired.type === "DAILY_RECOVERY" ? last : null,
    challengeDay: null,
    challengeWeek: desired.type === "WORKOUT_RECOVERY" ? Number(last) : null,
    targetDate:
      desired.type === "DAILY_RECOVERY" && completed ? desired.clearingKey : null,
    targetWeek:
      desired.type === "WORKOUT_RECOVERY"
        ? completed
          ? Number(desired.clearingKey)
          : Number(last) + 1
        : null,
    status: completed ? ("COMPLETED" as const) : ("ACTIVE" as const),
    completedAt: completed ? (existing?.completedAt ?? now) : null,
    cancelledAt: null,
  };
  try {
    await RecoveryProtocolModel.findOneAndUpdate(
      filter,
      {
        $setOnInsert: {
          ...filter,
          sourceType:
            desired.type === "DAILY_RECOVERY"
              ? "FINALIZED_DAILY_FAILURE"
              : "FINALIZED_WORKOUT_WEEK_FAILURE",
          assignedAt: now,
          activatedAt: now,
          requirementType:
            desired.type === "DAILY_RECOVERY"
              ? "FUTURE_PERFECT_DAY"
              : "NEXT_WEEKLY_MISSION",
        },
        $set: set,
      },
      { upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    if (!duplicateKey(error)) throw error;
    await RecoveryProtocolModel.updateOne(filter, { $set: set });
  }
}

async function reconcileRecovery(
  userId: string,
  context: Phase9Context,
  derived: ReturnType<typeof buildMetrics>,
  now: Date,
) {
  await RecoveryProtocolModel.init();
  const protocols = await RecoveryProtocolModel.find({
    userId,
    winterArcConfigId: context.config.id,
  }).sort({ assignedAt: 1 });
  const endIndex = Math.min(
    calendarDayIndex(context.currentDate) - 1,
    calendarDayIndex(context.config.endDate),
  );
  const startIndex = calendarDayIndex(context.config.startDate);
  const finalizedDates = Array.from(
    { length: Math.max(endIndex - startIndex + 1, 0) },
    (_, offset) => addCalendarDays(context.config.startDate, offset),
  );
  const secured = new Set(derived.securedWeeks);
  const finalizedWeeks: string[] = [];
  for (let week = 1; week <= Math.ceil(context.config.durationDays / 7); week += 1) {
    const bounds = getChallengeWeekBounds({
      challengeStartDate: context.config.startDate,
      durationDays: context.config.durationDays,
      challengeWeek: week,
    });
    if (calendarDayIndex(bounds.weekEndDate) < calendarDayIndex(context.currentDate))
      finalizedWeeks.push(String(week));
  }
  const desired: DesiredRecovery[] = [
    ...buildRecoveryEpisodes(finalizedDates, derived.perfectDates).map((item) => ({
      type: "DAILY_RECOVERY" as const,
      ...item,
    })),
    ...buildRecoveryEpisodes(finalizedWeeks, [...secured].map(String)).map((item) => ({
      type: "WORKOUT_RECOVERY" as const,
      ...item,
    })),
  ];
  const desiredKeys = new Set(
    desired.map(
      (item) => `${item.type}:${item.type.toLowerCase()}:${item.triggerKeys[0]}`,
    ),
  );
  const existingByKey = new Map(
    protocols.map((item) => [`${item.type}:${item.sourceKey}`, item]),
  );
  await Promise.all([
    ...desired.map((item) =>
      convergeRecovery(
        userId,
        context.config.id,
        item,
        existingByKey.get(
          `${item.type}:${item.type.toLowerCase()}:${item.triggerKeys[0]}`,
        ),
        now,
      ),
    ),
    ...protocols
      .filter((item) => !desiredKeys.has(`${item.type}:${item.sourceKey}`))
      .map((item) =>
        RecoveryProtocolModel.updateOne(
          { _id: item._id, userId },
          {
            $set: {
              status: "CANCELLED",
              cancelledAt: item.cancelledAt ?? now,
              completedAt: null,
            },
          },
        ),
      ),
  ]);
}

export async function reconcilePhase9Systems(userId: string, now = new Date()) {
  const context = await loadContext(userId, now);
  if (!context) return null;
  const derived = buildMetrics(context);
  await reconcileAchievements(userId, context, derived, now);
  await reconcileRewards(userId, context, derived, now);
  await reconcileRecovery(userId, context, derived, now);
  return { context, derived };
}

export async function getAchievementsSummary(userId: string, now = new Date()) {
  const reconciled = await reconcilePhase9Systems(userId, now);
  if (!reconciled)
    return { kind: "UNAVAILABLE", reason: "PROFILE_OR_CONFIGURATION_REQUIRED" } as const;
  const unlocks = await AchievementUnlockModel.find({
    userId,
    winterArcConfigId: reconciled.context.config.id,
  });
  const byKey = new Map(unlocks.map((unlock) => [unlock.achievementKey, unlock]));
  const achievements = reconciled.derived.progress.map((item) => ({
    key: item.key,
    name: item.name,
    description: item.description,
    category: item.category,
    current: item.current,
    target: item.target,
    progressPercent: item.progressPercent,
    status: byKey.get(item.key)?.status ?? "LOCKED",
    titleReward: "titleReward" in item ? item.titleReward : null,
    unlockedAt: byKey.get(item.key)?.unlockedAt.toISOString() ?? null,
  }));
  const activeTitles = achievements
    .filter((item) => item.status === "ACTIVE" && item.titleReward)
    .map((item) => item.titleReward!);
  return {
    kind: "AVAILABLE",
    unlocked: achievements.filter((item) => item.status === "ACTIVE"),
    locked: achievements.filter((item) => item.status !== "ACTIVE"),
    titles: activeTitles,
    selectedTitle: activeTitles.includes(
      reconciled.context.profile.selectedTitle as SystemTitle,
    )
      ? reconciled.context.profile.selectedTitle
      : null,
  } as const;
}

export async function selectSystemTitle(userId: string, title: string | null) {
  const [profile, config] = await Promise.all([
    getProfile(userId),
    getWinterArcConfig(userId),
  ]);
  if (!profile || !config || config.status !== "ACTIVE")
    throw new AppError("TITLE_NOT_UNLOCKED");
  if (title !== null) {
    if (!SYSTEM_TITLES.includes(title as SystemTitle))
      throw new AppError("TITLE_NOT_UNLOCKED");
    const definition = ACHIEVEMENT_DEFINITIONS.find(
      (item) => "titleReward" in item && item.titleReward === title,
    );
    const unlocked = definition
      ? await AchievementUnlockModel.exists({
          userId,
          winterArcConfigId: config.id,
          achievementKey: definition.key,
          achievementVersion: ACHIEVEMENT_POLICY_VERSION,
          status: "ACTIVE",
        })
      : null;
    if (!unlocked) throw new AppError("TITLE_NOT_UNLOCKED");
  }
  await UserProfileModel.updateOne({ userId }, { $set: { selectedTitle: title } });
  return { selectedTitle: title } as const;
}

export async function getRewardsSummary(userId: string, now = new Date()) {
  const reconciled = await reconcilePhase9Systems(userId, now);
  if (!reconciled)
    return { kind: "UNAVAILABLE", reason: "PROFILE_OR_CONFIGURATION_REQUIRED" } as const;
  const rewards = await RewardGrantModel.find({
    userId,
    winterArcConfigId: reconciled.context.config.id,
    status: "ACTIVE",
  }).sort({ grantedAt: -1 });
  const dto = rewards.map((reward) => ({
    type: reward.rewardType,
    key: reward.rewardKey,
    title: reward.title,
    description: reward.description,
    challengeDay: reward.challengeDay,
    challengeWeek: reward.challengeWeek,
    grantedAt: reward.grantedAt.toISOString(),
    claimedAt: reward.claimedAt?.toISOString() ?? null,
  }));
  return {
    kind: "AVAILABLE",
    counts: {
      dailyClears: dto.filter((reward) => reward.type === "DAILY_CLEAR").length,
      perfectWeeks: dto.filter((reward) => reward.type === "PERFECT_WEEK").length,
      workoutWeeks: dto.filter((reward) => reward.type === "WORKOUT_WEEK").length,
      milestones: dto.filter((reward) => reward.type === "LEVEL_MILESTONE").length,
    },
    recent: dto.slice(0, 30),
    personalRewards: [] as const,
  } as const;
}

function recoveryDto(protocol: RecoveryProtocolDocument) {
  return {
    type: protocol.type,
    status: protocol.status,
    failureCount: protocol.failureCount,
    triggerDate: protocol.triggerDate,
    challengeWeek: protocol.challengeWeek,
    requirementType: protocol.requirementType,
    targetDate: protocol.targetDate,
    targetWeek: protocol.targetWeek,
    assignedAt: protocol.assignedAt.toISOString(),
    completedAt: protocol.completedAt?.toISOString() ?? null,
  } as const;
}

export async function getRecoverySummary(userId: string, now = new Date()) {
  const reconciled = await reconcilePhase9Systems(userId, now);
  if (!reconciled)
    return { kind: "UNAVAILABLE", reason: "PROFILE_OR_CONFIGURATION_REQUIRED" } as const;
  const protocols = await RecoveryProtocolModel.find({
    userId,
    winterArcConfigId: reconciled.context.config.id,
  }).sort({ assignedAt: -1 });
  return {
    kind: "AVAILABLE",
    active: protocols.filter((protocol) => protocol.status === "ACTIVE").map(recoveryDto),
    history: protocols
      .filter((protocol) => protocol.status !== "ACTIVE")
      .slice(0, 20)
      .map(recoveryDto),
    configuredWorkoutTarget: reconciled.context.config.weeklyWorkoutTarget,
  } as const;
}

export async function getPhase9StatusSummary(userId: string, configId: string) {
  await connectToDatabase();
  const [
    profile,
    achievementCount,
    latestAchievement,
    dailyClearCount,
    perfectWeekCount,
    weeklyMissionRewardCount,
    activeRecovery,
  ] = await Promise.all([
    UserProfileModel.findOne({ userId }),
    AchievementUnlockModel.countDocuments({
      userId,
      winterArcConfigId: configId,
      status: "ACTIVE",
    }),
    AchievementUnlockModel.findOne({
      userId,
      winterArcConfigId: configId,
      status: "ACTIVE",
    }).sort({ unlockedAt: -1 }),
    RewardGrantModel.countDocuments({
      userId,
      winterArcConfigId: configId,
      status: "ACTIVE",
      rewardType: "DAILY_CLEAR",
    }),
    RewardGrantModel.countDocuments({
      userId,
      winterArcConfigId: configId,
      status: "ACTIVE",
      rewardType: "PERFECT_WEEK",
    }),
    RewardGrantModel.countDocuments({
      userId,
      winterArcConfigId: configId,
      status: "ACTIVE",
      rewardType: "WORKOUT_WEEK",
    }),
    RecoveryProtocolModel.find({ userId, winterArcConfigId: configId, status: "ACTIVE" }),
  ]);
  const definition = latestAchievement
    ? getAchievementDefinition(latestAchievement.achievementKey)
    : null;
  return {
    selectedTitle: profile?.selectedTitle ?? null,
    achievementCount,
    latestAchievement: definition ? { key: definition.key, name: definition.name } : null,
    activeRecovery: activeRecovery.map(recoveryDto),
    dailyClearCount,
    perfectWeekCount,
    weeklyMissionRewardCount,
  } as const;
}
