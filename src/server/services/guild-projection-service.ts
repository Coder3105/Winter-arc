import "server-only";

import { getDailyRuleDefinition } from "@/features/winter-arc/rules";
import { normalizeAvatarKey } from "@/lib/avatar-catalogue";
import { calculateChallengeDay } from "@/server/calculations";
import { connectToDatabase } from "@/server/db/mongoose";
import { AppError } from "@/server/errors/app-error";
import { OwnerModel } from "@/server/models/owner";
import type { WeeklyReportSnapshot } from "@/server/services/weekly-report-service";

import {
  getActiveGuildMemberIds,
  requireActiveGuildConnection,
} from "./guild-connection-service";
import { getGuildSharingPreferences } from "./guild-sharing-service";
import { getCalendarMonthHistory, getStreakHistory } from "./history-service";
import { getProfile } from "./profile-service";
import { getProgressionSummary } from "./progression-service";
import { getWeeklyReport, getWeeklyReportList } from "./weekly-report-service";
import { getWinterArcConfig } from "./winter-arc-service";

async function memberIdentity(memberUserId: string, shareProfileSummary: boolean) {
  await connectToDatabase();
  const [account, profile] = await Promise.all([
    OwnerModel.findById(memberUserId),
    getProfile(memberUserId),
  ]);
  if (!account || !account.isActive || account.status !== "ACTIVE") {
    throw new AppError("GUILD_MEMBER_NOT_FOUND");
  }
  return {
    userId: account._id.toString(),
    displayName: profile?.displayName ?? account.displayName,
    avatarKey: shareProfileSummary ? normalizeAvatarKey(profile?.avatarKey) : null,
    selectedTitle: shareProfileSummary ? (profile?.selectedTitle ?? null) : null,
  } as const;
}

function latestReportSummary(reports: Awaited<ReturnType<typeof getWeeklyReportList>>) {
  if (reports.kind !== "AVAILABLE") return null;
  return reports.current ?? reports.finalized[0] ?? null;
}

export async function getGuildMemberProfileProjection(
  requesterUserId: string,
  memberUserId: string,
  now = new Date(),
) {
  await requireActiveGuildConnection(requesterUserId, memberUserId);
  const sharing = await getGuildSharingPreferences(memberUserId);
  const [identity, profile, config] = await Promise.all([
    memberIdentity(memberUserId, sharing.shareProfileSummary),
    getProfile(memberUserId),
    getWinterArcConfig(memberUserId),
  ]);

  const [progression, streaks, reports] = await Promise.all([
    sharing.shareProgression ? getProgressionSummary(memberUserId, now) : null,
    sharing.shareCalendar ? getStreakHistory(memberUserId, now) : null,
    sharing.shareWeeklyReports || sharing.shareWorkoutSummary
      ? getWeeklyReportList(memberUserId, now)
      : null,
  ]);
  const latest = reports ? latestReportSummary(reports) : null;
  const workoutReport =
    sharing.shareWorkoutSummary && latest
      ? await getWeeklyReport(memberUserId, latest.challengeWeek, now)
      : null;
  const challenge =
    profile && config?.status === "ACTIVE"
      ? calculateChallengeDay({
          startDate: config.startDate,
          currentDate: now,
          timezone: profile.timezone,
          durationDays: config.durationDays,
        })
      : null;

  return {
    identity: {
      userId: identity.userId,
      displayName: identity.displayName,
      avatarKey: identity.avatarKey,
      ...(sharing.shareProfileSummary
        ? { selectedTitle: identity.selectedTitle }
        : { selectedTitle: null }),
    },
    summary: sharing.shareProfileSummary
      ? {
          challengeDay: challenge?.status === "ACTIVE" ? challenge.dayNumber : null,
          challengeStatus: challenge?.status ?? null,
          currentPerfectDayStreak:
            streaks?.kind === "AVAILABLE" ? streaks.perfectDay.current : null,
          currentWorkoutWeekStreak:
            workoutReport?.kind === "AVAILABLE"
              ? workoutReport.report.workout.weeklyStreak
              : null,
          latestArcScore: sharing.shareWeeklyReports && latest ? latest.arcScore : null,
        }
      : null,
    progression:
      progression?.kind === "AVAILABLE"
        ? {
            level: progression.level.current,
            rank: progression.rank.current,
            totalXp: progression.totalXp,
          }
        : null,
    access: {
      calendar: sharing.shareCalendar,
      weeklyReports: sharing.shareWeeklyReports,
      progression: sharing.shareProgression,
      workoutSummary: sharing.shareWorkoutSummary,
    },
  } as const;
}

export async function getGuildMemberListProjection(
  requesterUserId: string,
  now = new Date(),
) {
  const memberIds = await getActiveGuildMemberIds(requesterUserId);
  return Promise.all(
    memberIds.map(async (memberId) => {
      const profile = await getGuildMemberProfileProjection(
        requesterUserId,
        memberId,
        now,
      );
      return {
        ...profile.identity,
        summary: profile.summary,
        progression: profile.progression,
        access: profile.access,
      };
    }),
  );
}

export async function getGuildMemberCalendarProjection(
  requesterUserId: string,
  memberUserId: string,
  month: string,
  now = new Date(),
) {
  await requireActiveGuildConnection(requesterUserId, memberUserId);
  const sharing = await getGuildSharingPreferences(memberUserId);
  if (!sharing.shareCalendar) throw new AppError("GUILD_SHARING_DISABLED");
  const calendar = await getCalendarMonthHistory(memberUserId, month, now);
  if (calendar.kind !== "AVAILABLE") return calendar;
  return {
    kind: "AVAILABLE",
    member: await memberIdentity(memberUserId, sharing.shareProfileSummary),
    month: calendar.month,
    currentDate: calendar.currentDate,
    leadingMondaySlots: calendar.leadingMondaySlots,
    challenge: calendar.challenge,
    days: calendar.days.map((day) => ({
      date: day.date,
      challengeDay: day.challengeDay,
      challengeWeek: day.challengeWeek,
      relation: day.relation,
      temporalState: day.temporalState,
      recordExists: day.recordExists,
      calendarState: day.calendarState,
      isPerfectDay: day.isPerfectDay,
      completionPercent: day.completionPercent,
      ...(sharing.shareWorkoutSummary
        ? {
            hasWorkout: day.hasWorkout,
            workoutSessionCount: day.workoutSessionCount,
          }
        : {}),
      ...(sharing.shareWeight
        ? { hasWeight: day.hasWeight, weightKg: day.weightKg }
        : {}),
    })),
  } as const;
}

export function ruleMayBeShared(key: string, sharePrivateHabits: boolean): boolean {
  const definition = getDailyRuleDefinition(key);
  if (!definition) return false;
  return !definition.private || sharePrivateHabits;
}

export function projectGuildReport(
  report: WeeklyReportSnapshot,
  sharing: Awaited<ReturnType<typeof getGuildSharingPreferences>>,
) {
  const rules = report.rules.filter((rule) =>
    ruleMayBeShared(rule.key, sharing.sharePrivateHabits),
  );
  return {
    status: report.status,
    generatedAt: report.generatedAt,
    period: report.period,
    dailyQuest: {
      elapsedDays: report.dailyQuest.elapsedDays,
      recordedDays: report.dailyQuest.recordedDays,
      missedDays: report.dailyQuest.missedDays,
      partialDays: report.dailyQuest.partialDays,
      perfectDays: report.dailyQuest.perfectDays,
      dailyDisciplinePercent: report.dailyQuest.dailyDisciplinePercent,
      perfectDayRate: report.dailyQuest.perfectDayRate,
      allAvailableDaysCleared: report.dailyQuest.allAvailableDaysCleared,
      perfectWeek: report.dailyQuest.perfectWeek,
    },
    rules,
    strongestRules: report.strongestRules.filter((rule) =>
      ruleMayBeShared(rule.key, sharing.sharePrivateHabits),
    ),
    attentionRules: report.attentionRules.filter((rule) =>
      ruleMayBeShared(rule.key, sharing.sharePrivateHabits),
    ),
    ...(sharing.shareWorkoutSummary
      ? {
          workout: {
            requiredWorkoutDays: report.workout.requiredWorkoutDays,
            completedWorkoutDays: report.workout.completedWorkoutDays,
            totalWorkoutSessions: report.workout.totalWorkoutSessions,
            missionState: report.workout.missionState,
            secured: report.workout.secured,
            completionPercent: report.workout.completionPercent,
            weeklyStreak: report.workout.weeklyStreak,
            longestWeeklyStreak: report.workout.longestWeeklyStreak,
          },
        }
      : {}),
    ...(sharing.shareProgression ? { progression: report.progression } : {}),
    ...(sharing.shareWeight ? { weight: report.weight } : {}),
    ...(sharing.shareBodyComposition ? { bodyComposition: report.bodyComposition } : {}),
    dailyBreakdown: report.dailyBreakdown.map((day) => ({
      date: day.date,
      challengeDay: day.challengeDay,
      calendarState: day.calendarState,
      recordExists: day.recordExists,
      completionPercent: day.completionPercent,
      isPerfectDay: day.isPerfectDay,
      ...(sharing.shareWorkoutSummary
        ? { workoutSessionCount: day.workoutSessionCount }
        : {}),
      ...(sharing.shareWeight ? { weightKg: day.weightKg } : {}),
      ...(sharing.shareProgression ? { xpEarned: day.xpEarned } : {}),
    })),
    arcScore: report.arcScore,
    systemEvaluation: { label: report.systemEvaluation.label },
  } as const;
}

function projectReportSummary(
  report: NonNullable<ReturnType<typeof latestReportSummary>>,
  sharing: Awaited<ReturnType<typeof getGuildSharingPreferences>>,
) {
  return {
    challengeWeek: report.challengeWeek,
    weekStartDate: report.weekStartDate,
    weekEndDate: report.weekEndDate,
    status: report.status,
    arcScore: report.arcScore,
    evaluation: report.evaluation,
    perfectDays: report.perfectDays,
    elapsedDays: report.elapsedDays,
    ...(sharing.shareWorkoutSummary
      ? {
          workoutDays: report.workoutDays,
          requiredWorkoutDays: report.requiredWorkoutDays,
        }
      : {}),
    ...(sharing.shareProgression ? { xpEarned: report.xpEarned } : {}),
  } as const;
}

export async function getGuildMemberReportListProjection(
  requesterUserId: string,
  memberUserId: string,
  now = new Date(),
) {
  await requireActiveGuildConnection(requesterUserId, memberUserId);
  const sharing = await getGuildSharingPreferences(memberUserId);
  if (!sharing.shareWeeklyReports) throw new AppError("GUILD_SHARING_DISABLED");
  const reports = await getWeeklyReportList(memberUserId, now);
  if (reports.kind !== "AVAILABLE") return reports;
  return {
    kind: "AVAILABLE",
    member: await memberIdentity(memberUserId, sharing.shareProfileSummary),
    current: reports.current ? projectReportSummary(reports.current, sharing) : null,
    finalized: reports.finalized.map((report) => projectReportSummary(report, sharing)),
  } as const;
}

export async function getGuildMemberReportProjection(
  requesterUserId: string,
  memberUserId: string,
  challengeWeek: number,
  now = new Date(),
) {
  await requireActiveGuildConnection(requesterUserId, memberUserId);
  const sharing = await getGuildSharingPreferences(memberUserId);
  if (!sharing.shareWeeklyReports) throw new AppError("GUILD_SHARING_DISABLED");
  const result = await getWeeklyReport(memberUserId, challengeWeek, now);
  if (result.kind !== "AVAILABLE") return result;
  return {
    kind: "AVAILABLE",
    member: await memberIdentity(memberUserId, sharing.shareProfileSummary),
    report: projectGuildReport(result.report, sharing),
  } as const;
}
