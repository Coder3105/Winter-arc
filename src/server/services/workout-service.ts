import "server-only";

import type { WorkoutInput } from "@/lib/validation/workout";
import {
  addCalendarDays,
  calculateChallengeDay,
  calculateWorkoutWeekStreak,
  challengeDayToWeek,
  evaluateWorkoutWeek,
  normalizeCalendarDate,
} from "@/server/calculations";
import { connectToDatabase } from "@/server/db/mongoose";
import { AppError } from "@/server/errors/app-error";
import {
  WorkoutRecordModel,
  type WorkoutRecordDocument,
} from "@/server/models/workout-record";

import { getProfile } from "./profile-service";
import { reconcileEventNotifications } from "./notification-service";
import { reconcilePhase9Systems } from "./achievement-reward-service";
import {
  reconcileWorkoutDayProgression,
  reconcileWorkoutWeekProgression,
} from "./progression-service";
import { getWinterArcConfig, type WinterArcConfigDto } from "./winter-arc-service";

export type WorkoutUnavailableReason =
  | "PROFILE_REQUIRED"
  | "CONFIGURATION_REQUIRED"
  | "PROTOCOL_NOT_STARTED"
  | "CHALLENGE_COMPLETED";

export interface WorkoutDto {
  readonly id: string;
  readonly date: string;
  readonly timezone: string;
  readonly challengeDay: number;
  readonly challengeWeek: number;
  readonly type: WorkoutRecordDocument["type"];
  readonly title: string | null;
  readonly durationMinutes: number;
  readonly notes: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string;
  readonly status: "COMPLETED";
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface WorkoutContext {
  readonly timezone: string;
  readonly currentDate: string;
  readonly config: WinterArcConfigDto;
}

export function toWorkoutDto(record: WorkoutRecordDocument): WorkoutDto {
  return {
    id: record._id.toString(),
    date: record.date,
    timezone: record.timezone,
    challengeDay: record.challengeDay,
    challengeWeek: record.challengeWeek,
    type: record.type,
    title: record.title,
    durationMinutes: record.durationMinutes,
    notes: record.notes,
    startedAt: record.startedAt?.toISOString() ?? null,
    completedAt: record.completedAt.toISOString(),
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

async function loadBaseContext(
  userId: string,
  now: Date,
): Promise<WorkoutContext | WorkoutUnavailableReason> {
  const [profile, config] = await Promise.all([
    getProfile(userId),
    getWinterArcConfig(userId),
  ]);
  if (!profile) return "PROFILE_REQUIRED";
  if (!config || config.status !== "ACTIVE") return "CONFIGURATION_REQUIRED";
  return {
    timezone: profile.timezone,
    currentDate: normalizeCalendarDate(now, profile.timezone),
    config,
  };
}

async function loadCurrentContext(userId: string, now: Date) {
  const context = await loadBaseContext(userId, now);
  if (typeof context === "string") return context;
  const challenge = calculateChallengeDay({
    startDate: context.config.startDate,
    currentDate: context.currentDate,
    timezone: context.timezone,
    durationDays: context.config.durationDays,
  });
  if (challenge.status === "NOT_STARTED") return "PROTOCOL_NOT_STARTED" as const;
  if (challenge.status === "COMPLETED") return "CHALLENGE_COMPLETED" as const;
  return { ...context, challenge };
}

async function queryProtocolWorkouts(userId: string, context: WorkoutContext) {
  await connectToDatabase();
  return WorkoutRecordModel.find({
    userId,
    winterArcConfigId: context.config.id,
    date: { $gte: context.config.startDate, $lte: context.config.endDate },
    status: "COMPLETED",
  }).sort({ date: 1, completedAt: 1 });
}

function buildDashboard(
  context: WorkoutContext & {
    readonly challenge: ReturnType<typeof calculateChallengeDay>;
  },
  records: readonly WorkoutRecordDocument[],
) {
  const currentWeek = challengeDayToWeek(
    context.challenge.dayNumber,
    context.config.durationDays,
  );
  const workoutDates = records.map((record) => record.date);
  const week = evaluateWorkoutWeek({
    challengeStartDate: context.config.startDate,
    durationDays: context.config.durationDays,
    challengeWeek: currentWeek.weekNumber,
    currentDate: context.currentDate,
    workoutDates,
    requiredWorkoutDays: context.config.weeklyWorkoutTarget,
  });
  const allWeeks = Array.from(
    { length: Math.ceil(context.config.durationDays / 7) },
    (_, index) =>
      evaluateWorkoutWeek({
        challengeStartDate: context.config.startDate,
        durationDays: context.config.durationDays,
        challengeWeek: index + 1,
        currentDate: context.currentDate,
        workoutDates,
        requiredWorkoutDays: context.config.weeklyWorkoutTarget,
      }),
  );
  const weekRecords = records.filter(
    (record) => record.challengeWeek === currentWeek.weekNumber,
  );
  const timeline = Array.from(
    { length: currentWeek.weekEndChallengeDay - currentWeek.weekStartChallengeDay + 1 },
    (_, index) => {
      const challengeDay = currentWeek.weekStartChallengeDay + index;
      const date = addCalendarDays(context.config.startDate, challengeDay - 1);
      const sessionCount = weekRecords.filter((record) => record.date === date).length;
      return {
        date,
        challengeDay,
        dayInChallengeWeek: index + 1,
        sessionCount,
        hasWorkout: sessionCount > 0,
        temporalState:
          date < context.currentDate
            ? ("PAST" as const)
            : date === context.currentDate
              ? ("TODAY" as const)
              : ("FUTURE" as const),
      };
    },
  );
  return {
    kind: "AVAILABLE",
    timezone: context.timezone,
    localDate: context.currentDate,
    challengeDay: context.challenge.dayNumber,
    durationDays: context.config.durationDays,
    todaySessions: records
      .filter((record) => record.date === context.currentDate)
      .map(toWorkoutDto),
    week,
    timeline,
    weekSessions: weekRecords.map(toWorkoutDto),
    streak: calculateWorkoutWeekStreak(allWeeks),
  } as const;
}

export async function getCurrentWorkoutDashboard(userId: string, now = new Date()) {
  const context = await loadCurrentContext(userId, now);
  if (typeof context === "string") {
    return { kind: "UNAVAILABLE", reason: context } as const;
  }
  const records = await queryProtocolWorkouts(userId, context);
  return buildDashboard(context, records);
}

export async function getTodayWorkouts(userId: string, now = new Date()) {
  const context = await loadCurrentContext(userId, now);
  if (typeof context === "string") {
    return { kind: "UNAVAILABLE", reason: context } as const;
  }
  await connectToDatabase();
  const records = await WorkoutRecordModel.find({
    userId,
    winterArcConfigId: context.config.id,
    date: context.currentDate,
    status: "COMPLETED",
  }).sort({ completedAt: 1 });
  return {
    kind: "AVAILABLE",
    localDate: context.currentDate,
    sessions: records.map(toWorkoutDto),
  } as const;
}

export async function createTodayWorkout(
  userId: string,
  input: WorkoutInput,
  now = new Date(),
): Promise<WorkoutDto> {
  const context = await loadCurrentContext(userId, now);
  if (typeof context === "string") throw new AppError("WORKOUT_NOT_AVAILABLE");
  const week = challengeDayToWeek(
    context.challenge.dayNumber,
    context.config.durationDays,
  );
  await connectToDatabase();
  const record = await WorkoutRecordModel.create({
    userId,
    winterArcConfigId: context.config.id,
    date: context.currentDate,
    timezone: context.timezone,
    challengeDay: context.challenge.dayNumber,
    challengeWeek: week.weekNumber,
    type: input.type,
    title: input.title,
    durationMinutes: input.durationMinutes,
    notes: input.notes,
    startedAt: null,
    completedAt: now,
    status: "COMPLETED",
  });
  await reconcileWorkoutDayProgression(
    userId,
    context.config,
    context.currentDate,
    context.challenge.dayNumber,
    week.weekNumber,
    now,
  );
  await reconcileWorkoutWeekProgression(
    userId,
    context.config,
    week.weekNumber,
    context.currentDate,
    now,
  );
  await reconcilePhase9Systems(userId, now);
  await reconcileEventNotifications(userId, now);
  return toWorkoutDto(record);
}

export async function deleteTodayWorkout(
  userId: string,
  workoutId: string,
  now = new Date(),
): Promise<WorkoutDto> {
  const context = await loadCurrentContext(userId, now);
  if (typeof context === "string") throw new AppError("WORKOUT_NOT_AVAILABLE");
  await connectToDatabase();
  const record = await WorkoutRecordModel.findOneAndDelete({
    _id: workoutId,
    userId,
    winterArcConfigId: context.config.id,
    date: context.currentDate,
  });
  if (!record) throw new AppError("WORKOUT_NOT_FOUND");
  await reconcileWorkoutDayProgression(
    userId,
    context.config,
    record.date,
    record.challengeDay,
    record.challengeWeek,
    now,
  );
  await reconcileWorkoutWeekProgression(
    userId,
    context.config,
    record.challengeWeek,
    context.currentDate,
    now,
  );
  await reconcilePhase9Systems(userId, now);
  await reconcileEventNotifications(userId, now);
  return toWorkoutDto(record);
}

export async function getWorkoutsByDate(userId: string, date: string, now = new Date()) {
  const context = await loadBaseContext(userId, now);
  if (typeof context === "string") {
    return { kind: "UNAVAILABLE", reason: context } as const;
  }
  const challenge = calculateChallengeDay({
    startDate: context.config.startDate,
    currentDate: date,
    timezone: context.timezone,
    durationDays: context.config.durationDays,
  });
  if (challenge.status !== "ACTIVE") throw new AppError("WORKOUT_NOT_AVAILABLE");
  await connectToDatabase();
  const records = await WorkoutRecordModel.find({
    userId,
    winterArcConfigId: context.config.id,
    date,
    status: "COMPLETED",
  }).sort({ completedAt: 1 });
  return { kind: "AVAILABLE", date, sessions: records.map(toWorkoutDto) } as const;
}
