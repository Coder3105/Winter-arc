import "server-only";

import {
  ARC_SCORE_POLICY_VERSION,
  WEEKLY_REPORT_POLICY_VERSION,
  addCalendarDays,
  calculateArcScore,
  calculateDailyDiscipline,
  calculateLevelFromXp,
  calculateWorkoutScoreComponent,
  calculateWorkoutWeekStreak,
  calendarDayIndex,
  compareWeeklyReports,
  evaluateWorkoutWeek,
  generateSystemEvaluation,
  getChallengeWeekBounds,
  getRankForLevel,
  normalizeCalendarDate,
  rankWeeklyRules,
  calculateWeeklyRuleMetrics,
  type ReportDayInput,
} from "@/server/calculations";
import { getAchievementDefinition } from "@/server/achievements/achievement-policy";
import { connectToDatabase } from "@/server/db/mongoose";
import { AppError } from "@/server/errors/app-error";
import {
  AchievementUnlockModel,
  type AchievementUnlockDocument,
} from "@/server/models/achievement-unlock";
import {
  BodyCompositionAssessmentModel,
  type BodyCompositionAssessmentDocument,
} from "@/server/models/body-composition-assessment";
import {
  DailyQuestRecordModel,
  type DailyQuestRecordDocument,
} from "@/server/models/daily-quest-record";
import {
  ProgressionEventModel,
  type ProgressionEventDocument,
} from "@/server/models/progression-event";
import {
  RecoveryProtocolModel,
  type RecoveryProtocolDocument,
} from "@/server/models/recovery-protocol";
import { RewardGrantModel, type RewardGrantDocument } from "@/server/models/reward-grant";
import { WeeklyReportModel } from "@/server/models/weekly-report";
import {
  WeightRecordModel,
  type WeightRecordDocument,
} from "@/server/models/weight-record";
import {
  WorkoutRecordModel,
  type WorkoutRecordDocument,
} from "@/server/models/workout-record";

import { evaluateDailyQuestRecord } from "./daily-quest-service";
import { getProfile } from "./profile-service";
import { getWinterArcConfig, type WinterArcConfigDto } from "./winter-arc-service";

export type WeeklyReportUnavailableReason =
  "PROFILE_REQUIRED" | "CONFIGURATION_REQUIRED" | "PROTOCOL_NOT_STARTED";

interface ReportContext {
  readonly userId: string;
  readonly timezone: string;
  readonly currentDate: string;
  readonly config: WinterArcConfigDto;
  readonly quests: readonly DailyQuestRecordDocument[];
  readonly workouts: readonly WorkoutRecordDocument[];
  readonly weights: readonly WeightRecordDocument[];
  readonly events: readonly ProgressionEventDocument[];
  readonly achievements: readonly AchievementUnlockDocument[];
  readonly rewards: readonly RewardGrantDocument[];
  readonly recoveries: readonly RecoveryProtocolDocument[];
  readonly assessments: readonly BodyCompositionAssessmentDocument[];
}

export interface WeeklyReportSnapshot {
  readonly reportPolicyVersion: number;
  readonly status: "PREVIEW" | "FINAL";
  readonly generatedAt: string;
  readonly period: {
    readonly challengeWeek: number;
    readonly weekStartDate: string;
    readonly weekEndDate: string;
    readonly challengeDayStart: number;
    readonly challengeDayEnd: number;
    readonly availableDays: number;
    readonly nextAvailableWeek: number | null;
  };
  readonly dailyQuest: ReturnType<typeof calculateDailyDiscipline> & {
    readonly allAvailableDaysCleared: boolean;
    readonly perfectWeek: boolean;
  };
  readonly rules: readonly ReturnType<typeof calculateWeeklyRuleMetrics>[number][];
  readonly strongestRules: readonly ReturnType<
    typeof calculateWeeklyRuleMetrics
  >[number][];
  readonly attentionRules: readonly ReturnType<
    typeof calculateWeeklyRuleMetrics
  >[number][];
  readonly workout: {
    readonly requiredWorkoutDays: number;
    readonly completedWorkoutDays: number;
    readonly totalWorkoutSessions: number;
    readonly workoutDates: readonly string[];
    readonly missionState: string;
    readonly secured: boolean;
    readonly workoutsRemaining: number | null;
    readonly daysRemaining: number | null;
    readonly completionPercent: number;
    readonly weeklyStreak: number;
    readonly longestWeeklyStreak: number;
  };
  readonly weight: {
    readonly firstWeightKg: number | null;
    readonly firstWeightDate: string | null;
    readonly lastWeightKg: number | null;
    readonly lastWeightDate: string | null;
    readonly deltaKg: number | null;
    readonly deltaPercent: number | null;
    readonly averageWeightKg: number | null;
    readonly measurementCount: number;
    readonly isSufficientData: boolean;
    readonly previousAverageWeightKg: number | null;
    readonly averageDeltaKg: number | null;
  };
  readonly bodyComposition: readonly {
    readonly assessmentDate: string;
    readonly weightKg: number;
    readonly percentBodyFat: number;
    readonly skeletalMuscleMassKg: number;
  }[];
  readonly progression: {
    readonly xpEarned: number;
    readonly dailyRulesXp: number;
    readonly perfectDayXp: number;
    readonly workoutDayXp: number;
    readonly weeklyMissionXp: number;
    readonly startingLevel: number;
    readonly endingLevel: number;
    readonly startingRank: string;
    readonly endingRank: string;
    readonly levelsGained: number;
  };
  readonly achievements: readonly {
    readonly key: string;
    readonly name: string;
    readonly titleReward: string | null;
    readonly unlockedAt: string;
  }[];
  readonly rewards: {
    readonly count: number;
    readonly items: readonly {
      readonly type: string;
      readonly title: string;
      readonly grantedAt: string;
    }[];
  };
  readonly recovery: {
    readonly dailyAssigned: number;
    readonly workoutAssigned: number;
    readonly dailyCompleted: number;
    readonly workoutCompleted: number;
    readonly active: boolean;
  };
  readonly dailyBreakdown: readonly {
    readonly date: string;
    readonly challengeDay: number;
    readonly calendarState: "PERFECT" | "PARTIAL" | "MISSED" | "PENDING";
    readonly recordExists: boolean;
    readonly completionPercent: number;
    readonly isPerfectDay: boolean;
    readonly workoutSessionCount: number;
    readonly weightKg: number | null;
    readonly xpEarned: number;
  }[];
  readonly arcScore: {
    readonly value: number | null;
    readonly policyVersion: number;
    readonly isProvisional: boolean;
  };
  readonly systemEvaluation: ReturnType<typeof generateSystemEvaluation>;
  readonly comparison: ReturnType<typeof compareWeeklyReports>;
}

function localDate(date: Date, timezone: string) {
  return normalizeCalendarDate(date, timezone);
}

async function loadContext(userId: string, now: Date) {
  const [profile, config] = await Promise.all([
    getProfile(userId),
    getWinterArcConfig(userId),
  ]);
  if (!profile)
    return { unavailable: "PROFILE_REQUIRED" as WeeklyReportUnavailableReason };
  if (!config || config.status !== "ACTIVE")
    return { unavailable: "CONFIGURATION_REQUIRED" as WeeklyReportUnavailableReason };
  const currentDate = normalizeCalendarDate(now, profile.timezone);
  if (currentDate < config.startDate)
    return { unavailable: "PROTOCOL_NOT_STARTED" as WeeklyReportUnavailableReason };
  await connectToDatabase();
  const base = { userId, winterArcConfigId: config.id };
  const [
    quests,
    workouts,
    weights,
    events,
    achievements,
    rewards,
    recoveries,
    assessments,
  ] = await Promise.all([
    DailyQuestRecordModel.find({
      ...base,
      date: { $gte: config.startDate, $lte: config.endDate },
    }).sort({ date: 1 }),
    WorkoutRecordModel.find({
      ...base,
      status: "COMPLETED",
      date: { $gte: config.startDate, $lte: config.endDate },
    }).sort({ date: 1 }),
    WeightRecordModel.find({
      ...base,
      date: { $gte: config.startDate, $lte: config.endDate },
    }).sort({ date: 1 }),
    ProgressionEventModel.find({ ...base, status: "ACTIVE" }).sort({
      challengeWeek: 1,
      earnedAt: 1,
    }),
    AchievementUnlockModel.find({ ...base, status: "ACTIVE" }).sort({ unlockedAt: 1 }),
    RewardGrantModel.find({ ...base, status: "ACTIVE" }).sort({ grantedAt: 1 }),
    RecoveryProtocolModel.find(base).sort({ assignedAt: 1 }),
    BodyCompositionAssessmentModel.find({ userId }).sort({ assessmentDate: 1 }),
  ]);
  return {
    context: {
      userId,
      timezone: profile.timezone,
      currentDate,
      config,
      quests,
      workouts,
      weights,
      events,
      achievements,
      rewards,
      recoveries,
      assessments,
    } satisfies ReportContext,
  };
}

function mean(values: readonly number[]) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function dateInRange(date: string, start: string, end: string) {
  return date >= start && date <= end;
}

function comparisonSource(report: WeeklyReportSnapshot) {
  return {
    arcScore: report.arcScore.value,
    dailyDisciplinePercent: report.dailyQuest.dailyDisciplinePercent,
    perfectDays: report.dailyQuest.perfectDays,
    workoutDays: report.workout.completedWorkoutDays,
    xpEarned: report.progression.xpEarned,
    averageWeightKg: report.weight.averageWeightKg,
  };
}

function buildReport(
  context: ReportContext,
  challengeWeek: number,
  generatedAt: Date,
  previous: WeeklyReportSnapshot | null,
): WeeklyReportSnapshot {
  const bounds = getChallengeWeekBounds({
    challengeStartDate: context.config.startDate,
    durationDays: context.config.durationDays,
    challengeWeek,
  });
  if (bounds.weekStartDate > context.currentDate)
    throw new AppError("REPORT_NOT_AVAILABLE");
  const status: "FINAL" | "PREVIEW" =
    context.currentDate > bounds.weekEndDate ? "FINAL" : "PREVIEW";
  const elapsedEnd = status === "FINAL" ? bounds.weekEndDate : context.currentDate;
  const elapsedCount =
    calendarDayIndex(elapsedEnd) - calendarDayIndex(bounds.weekStartDate) + 1;
  const questByDate = new Map(context.quests.map((record) => [record.date, record]));
  const weightByDate = new Map(
    context.weights.map((record) => [record.date, record.weightKg]),
  );
  const eventsByDate = new Map<string, number>();
  for (const event of context.events) {
    if (event.sourceDate)
      eventsByDate.set(
        event.sourceDate,
        (eventsByDate.get(event.sourceDate) ?? 0) + event.xp,
      );
  }
  const days: ReportDayInput[] = Array.from(
    { length: Math.max(elapsedCount, 0) },
    (_, offset) => {
      const date = addCalendarDays(bounds.weekStartDate, offset);
      const record = questByDate.get(date);
      const quest = record
        ? evaluateDailyQuestRecord(
            record,
            context.config.durationDays,
            context.currentDate,
          )
        : null;
      return {
        date,
        challengeDay: bounds.startChallengeDay + offset,
        recordExists: Boolean(record),
        completionPercent: quest?.completionPercent ?? 0,
        isPerfectDay: quest?.isPerfectDay ?? false,
        rules:
          quest?.rules.map((rule) => ({
            key: rule.key,
            name: rule.name,
            order: rule.order,
            state: rule.state,
          })) ?? [],
        workoutSessionCount: context.workouts.filter((workout) => workout.date === date)
          .length,
        weightKg: weightByDate.get(date) ?? null,
        xpEarned: eventsByDate.get(date) ?? 0,
        isToday: date === context.currentDate,
      };
    },
  );
  const daily = calculateDailyDiscipline(days);
  const rules = calculateWeeklyRuleMetrics(days);
  const ranked = rankWeeklyRules(rules);
  const workoutDates = context.workouts.map((workout) => workout.date);
  const workout = evaluateWorkoutWeek({
    challengeStartDate: context.config.startDate,
    durationDays: context.config.durationDays,
    challengeWeek,
    currentDate:
      status === "FINAL" ? addCalendarDays(bounds.weekEndDate, 1) : context.currentDate,
    workoutDates,
    requiredWorkoutDays: context.config.weeklyWorkoutTarget,
  });
  const workoutWeeks = Array.from({ length: challengeWeek }, (_, index) =>
    evaluateWorkoutWeek({
      challengeStartDate: context.config.startDate,
      durationDays: context.config.durationDays,
      challengeWeek: index + 1,
      currentDate:
        status === "FINAL" ? addCalendarDays(bounds.weekEndDate, 1) : context.currentDate,
      workoutDates,
      requiredWorkoutDays: context.config.weeklyWorkoutTarget,
    }),
  );
  const streak = calculateWorkoutWeekStreak(workoutWeeks);
  const workoutComponent = calculateWorkoutScoreComponent(
    workout.completedWorkoutDays,
    context.config.weeklyWorkoutTarget,
  );
  const score = calculateArcScore({
    dailyDisciplinePercent: daily.dailyDisciplinePercent,
    workoutCompletionPercent: workoutComponent,
  });

  const weekWeights = context.weights.filter(
    (record) => record.challengeWeek === challengeWeek,
  );
  const previousWeights = context.weights.filter(
    (record) => record.challengeWeek === challengeWeek - 1,
  );
  const averageWeightKg = mean(weekWeights.map((record) => record.weightKg));
  const previousAverageWeightKg = mean(previousWeights.map((record) => record.weightKg));
  const firstWeight = weekWeights[0] ?? null;
  const lastWeight = weekWeights.at(-1) ?? null;

  const weekEvents = context.events.filter(
    (event) => event.challengeWeek === challengeWeek,
  );
  const startingXp = context.events
    .filter(
      (event) => event.challengeWeek !== null && event.challengeWeek < challengeWeek,
    )
    .reduce((sum, event) => sum + event.xp, 0);
  const xpEarned = weekEvents.reduce((sum, event) => sum + event.xp, 0);
  const endingXp = startingXp + xpEarned;
  const startingLevel = calculateLevelFromXp(startingXp);
  const endingLevel = calculateLevelFromXp(endingXp);

  const achievements = context.achievements
    .filter((item) =>
      dateInRange(
        localDate(item.unlockedAt, context.timezone),
        bounds.weekStartDate,
        bounds.weekEndDate,
      ),
    )
    .map((item) => {
      const definition = getAchievementDefinition(item.achievementKey);
      return {
        key: item.achievementKey,
        name: definition?.name ?? item.achievementKey.replaceAll("_", " "),
        titleReward:
          definition && "titleReward" in definition ? definition.titleReward : null,
        unlockedAt: item.unlockedAt.toISOString(),
      };
    });
  const rewardItems = context.rewards
    .filter((item) =>
      dateInRange(
        localDate(item.grantedAt, context.timezone),
        bounds.weekStartDate,
        bounds.weekEndDate,
      ),
    )
    .map((item) => ({
      type: item.rewardType,
      title: item.title,
      grantedAt: item.grantedAt.toISOString(),
    }));
  const recoveryAssigned = context.recoveries.filter((item) =>
    dateInRange(
      localDate(item.assignedAt, context.timezone),
      bounds.weekStartDate,
      bounds.weekEndDate,
    ),
  );
  const recoveryCompleted = context.recoveries.filter(
    (item) =>
      item.completedAt &&
      dateInRange(
        localDate(item.completedAt, context.timezone),
        bounds.weekStartDate,
        bounds.weekEndDate,
      ),
  );
  const recovery = {
    dailyAssigned: recoveryAssigned.filter((item) => item.type === "DAILY_RECOVERY")
      .length,
    workoutAssigned: recoveryAssigned.filter((item) => item.type === "WORKOUT_RECOVERY")
      .length,
    dailyCompleted: recoveryCompleted.filter((item) => item.type === "DAILY_RECOVERY")
      .length,
    workoutCompleted: recoveryCompleted.filter((item) => item.type === "WORKOUT_RECOVERY")
      .length,
    active: context.recoveries.some((item) => item.status === "ACTIVE"),
  };
  const systemEvaluation = generateSystemEvaluation({
    score,
    daily,
    strongestRules: ranked.strongestRules,
    attentionRules: ranked.attentionRules,
    workoutSecured: workout.state === "SECURED",
    requiredWorkoutDays: context.config.weeklyWorkoutTarget,
    weightSufficient: weekWeights.length >= 4,
    activeRecovery: recovery.active,
  });
  const bodyComposition = context.assessments
    .filter((item) =>
      dateInRange(
        localDate(item.assessmentDate, context.timezone),
        bounds.weekStartDate,
        bounds.weekEndDate,
      ),
    )
    .map((item) => ({
      assessmentDate: localDate(item.assessmentDate, context.timezone),
      weightKg: item.measurements.weightKg,
      percentBodyFat: item.measurements.percentBodyFat,
      skeletalMuscleMassKg: item.measurements.skeletalMuscleMassKg,
    }));

  const reportWithoutComparison = {
    reportPolicyVersion: WEEKLY_REPORT_POLICY_VERSION,
    status,
    generatedAt: generatedAt.toISOString(),
    period: {
      challengeWeek,
      weekStartDate: bounds.weekStartDate,
      weekEndDate: bounds.weekEndDate,
      challengeDayStart: bounds.startChallengeDay,
      challengeDayEnd: bounds.endChallengeDay,
      availableDays: bounds.weekLengthDays,
      nextAvailableWeek:
        challengeWeek < availableWeekCount(context) ? challengeWeek + 1 : null,
    },
    dailyQuest: {
      ...daily,
      allAvailableDaysCleared:
        status === "FINAL" && daily.perfectDays === bounds.weekLengthDays,
      perfectWeek:
        status === "FINAL" && bounds.weekLengthDays === 7 && daily.perfectDays === 7,
    },
    rules,
    strongestRules: ranked.strongestRules,
    attentionRules: ranked.attentionRules,
    workout: {
      requiredWorkoutDays: context.config.weeklyWorkoutTarget,
      completedWorkoutDays: workout.completedWorkoutDays,
      totalWorkoutSessions: workout.totalWorkoutSessions,
      workoutDates: workout.workoutDates,
      missionState: workout.state,
      secured: workout.state === "SECURED",
      workoutsRemaining: status === "PREVIEW" ? workout.workoutsRemaining : 0,
      daysRemaining: status === "PREVIEW" ? workout.daysRemaining : 0,
      completionPercent: workoutComponent,
      weeklyStreak: streak.current,
      longestWeeklyStreak: streak.longest,
    },
    weight: {
      firstWeightKg: firstWeight?.weightKg ?? null,
      firstWeightDate: firstWeight?.date ?? null,
      lastWeightKg: lastWeight?.weightKg ?? null,
      lastWeightDate: lastWeight?.date ?? null,
      deltaKg:
        firstWeight && lastWeight && firstWeight !== lastWeight
          ? lastWeight.weightKg - firstWeight.weightKg
          : null,
      deltaPercent:
        firstWeight && lastWeight && firstWeight !== lastWeight
          ? ((lastWeight.weightKg - firstWeight.weightKg) / firstWeight.weightKg) * 100
          : null,
      averageWeightKg,
      measurementCount: weekWeights.length,
      isSufficientData: weekWeights.length >= 4,
      previousAverageWeightKg,
      averageDeltaKg:
        averageWeightKg === null || previousAverageWeightKg === null
          ? null
          : averageWeightKg - previousAverageWeightKg,
    },
    bodyComposition,
    progression: {
      xpEarned,
      dailyRulesXp: weekEvents
        .filter((event) => event.sourceType === "DAILY_RULE")
        .reduce((sum, event) => sum + event.xp, 0),
      perfectDayXp: weekEvents
        .filter((event) => event.sourceType === "PERFECT_DAY")
        .reduce((sum, event) => sum + event.xp, 0),
      workoutDayXp: weekEvents
        .filter((event) => event.sourceType === "WORKOUT_DAY")
        .reduce((sum, event) => sum + event.xp, 0),
      weeklyMissionXp: weekEvents
        .filter((event) => event.sourceType === "WEEKLY_WORKOUT")
        .reduce((sum, event) => sum + event.xp, 0),
      startingLevel,
      endingLevel,
      startingRank: getRankForLevel(startingLevel),
      endingRank: getRankForLevel(endingLevel),
      levelsGained: endingLevel - startingLevel,
    },
    achievements,
    rewards: { count: rewardItems.length, items: rewardItems },
    recovery,
    dailyBreakdown: days.map((day) => ({
      date: day.date,
      challengeDay: day.challengeDay,
      calendarState: day.isPerfectDay
        ? ("PERFECT" as const)
        : !day.recordExists
          ? day.isToday
            ? ("PENDING" as const)
            : ("MISSED" as const)
          : ("PARTIAL" as const),
      recordExists: day.recordExists,
      completionPercent: day.completionPercent ?? 0,
      isPerfectDay: day.isPerfectDay,
      workoutSessionCount: day.workoutSessionCount,
      weightKg: day.weightKg,
      xpEarned: day.xpEarned,
    })),
    arcScore: {
      value: score,
      policyVersion: ARC_SCORE_POLICY_VERSION,
      isProvisional: status === "PREVIEW",
    },
    systemEvaluation,
  };
  return {
    ...reportWithoutComparison,
    comparison: compareWeeklyReports(
      {
        arcScore: reportWithoutComparison.arcScore.value,
        dailyDisciplinePercent: reportWithoutComparison.dailyQuest.dailyDisciplinePercent,
        perfectDays: reportWithoutComparison.dailyQuest.perfectDays,
        workoutDays: reportWithoutComparison.workout.completedWorkoutDays,
        xpEarned: reportWithoutComparison.progression.xpEarned,
        averageWeightKg: reportWithoutComparison.weight.averageWeightKg,
      },
      previous ? comparisonSource(previous) : null,
    ),
  };
}

async function persistFinal(
  context: ReportContext,
  report: WeeklyReportSnapshot,
  now: Date,
) {
  await WeeklyReportModel.init();
  const filter = {
    userId: context.userId,
    winterArcConfigId: context.config.id,
    challengeWeek: report.period.challengeWeek,
    reportPolicyVersion: WEEKLY_REPORT_POLICY_VERSION,
  };
  const existing = await WeeklyReportModel.findOne(filter);
  if (existing) return existing.snapshot as unknown as WeeklyReportSnapshot;
  const stored = await WeeklyReportModel.findOneAndUpdate(
    filter,
    {
      $setOnInsert: {
        ...filter,
        weekStartDate: report.period.weekStartDate,
        weekEndDate: report.period.weekEndDate,
        status: "FINAL",
        generatedAt: now,
        snapshot: report,
      },
    },
    {
      upsert: true,
      returnDocument: "after",
      runValidators: true,
      setDefaultsOnInsert: true,
    },
  );
  if (!stored) throw new AppError("INTERNAL_ERROR");
  return stored.snapshot as unknown as WeeklyReportSnapshot;
}

function availableWeekCount(context: ReportContext) {
  if (context.currentDate > context.config.endDate)
    return Math.ceil(context.config.durationDays / 7);
  return Math.min(
    Math.floor(
      (calendarDayIndex(context.currentDate) -
        calendarDayIndex(context.config.startDate)) /
        7,
    ) + 1,
    Math.ceil(context.config.durationDays / 7),
  );
}

export async function getWeeklyReport(
  userId: string,
  challengeWeek: number,
  now = new Date(),
) {
  if (!Number.isSafeInteger(challengeWeek) || challengeWeek <= 0)
    throw new AppError("VALIDATION_ERROR");
  const loaded = await loadContext(userId, now);
  if ("unavailable" in loaded)
    return { kind: "UNAVAILABLE", reason: loaded.unavailable } as const;
  const { context } = loaded;
  const maxWeeks = Math.ceil(context.config.durationDays / 7);
  if (challengeWeek > maxWeeks || challengeWeek > availableWeekCount(context))
    throw new AppError("REPORT_NOT_AVAILABLE");
  let previous: WeeklyReportSnapshot | null = null;
  if (challengeWeek > 1) {
    const stored = await WeeklyReportModel.findOne({
      userId,
      winterArcConfigId: context.config.id,
      challengeWeek: challengeWeek - 1,
      reportPolicyVersion: WEEKLY_REPORT_POLICY_VERSION,
    });
    previous = stored
      ? (stored.snapshot as unknown as WeeklyReportSnapshot)
      : buildReport(context, challengeWeek - 1, now, null);
  }
  const stored = await WeeklyReportModel.findOne({
    userId,
    winterArcConfigId: context.config.id,
    challengeWeek,
    reportPolicyVersion: WEEKLY_REPORT_POLICY_VERSION,
  });
  if (stored)
    return {
      kind: "AVAILABLE",
      report: stored.snapshot as unknown as WeeklyReportSnapshot,
    } as const;
  const report = buildReport(context, challengeWeek, now, previous);
  return {
    kind: "AVAILABLE",
    report: report.status === "FINAL" ? await persistFinal(context, report, now) : report,
  } as const;
}

export async function getWeeklyReportList(userId: string, now = new Date()) {
  const loaded = await loadContext(userId, now);
  if ("unavailable" in loaded)
    return { kind: "UNAVAILABLE", reason: loaded.unavailable } as const;
  const { context } = loaded;
  const count = availableWeekCount(context);
  const reports: WeeklyReportSnapshot[] = [];
  let previous: WeeklyReportSnapshot | null = null;
  for (let week = 1; week <= count; week += 1) {
    const existing = await WeeklyReportModel.findOne({
      userId,
      winterArcConfigId: context.config.id,
      challengeWeek: week,
      reportPolicyVersion: WEEKLY_REPORT_POLICY_VERSION,
    });
    const calculated: WeeklyReportSnapshot = existing
      ? (existing.snapshot as unknown as WeeklyReportSnapshot)
      : buildReport(context, week, now, previous);
    const report: WeeklyReportSnapshot =
      calculated.status === "FINAL"
        ? existing
          ? calculated
          : await persistFinal(context, calculated, now)
        : calculated;
    reports.push(report);
    previous = report;
  }
  const summaries = [...reports].reverse().map((report) => ({
    challengeWeek: report.period.challengeWeek,
    weekStartDate: report.period.weekStartDate,
    weekEndDate: report.period.weekEndDate,
    status: report.status,
    arcScore: report.arcScore.value,
    evaluation: report.systemEvaluation.label,
    perfectDays: report.dailyQuest.perfectDays,
    elapsedDays: report.dailyQuest.elapsedDays,
    workoutDays: report.workout.completedWorkoutDays,
    requiredWorkoutDays: report.workout.requiredWorkoutDays,
    xpEarned: report.progression.xpEarned,
  }));
  return {
    kind: "AVAILABLE",
    current: summaries.find((item) => item.status === "PREVIEW") ?? null,
    finalized: summaries.filter((item) => item.status === "FINAL"),
  } as const;
}

export type WeeklyReportResult = Awaited<ReturnType<typeof getWeeklyReport>>;
export type WeeklyReportListResult = Awaited<ReturnType<typeof getWeeklyReportList>>;
