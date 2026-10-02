import type { NotificationPreferencesInput } from "@/lib/validation/notification-preferences";
import type {
  NotificationPriority,
  NotificationType,
} from "@/server/models/notification-record";

export const NOTIFICATION_POLICY_VERSION = 1;
export const TIME_BASED_DAILY_CEILING = 10;
export const DAILY_QUEST_EMAIL_WINDOW = {
  startMinute: 18 * 60,
  endMinute: 19 * 60,
} as const;
export const DAILY_QUEST_EMAIL_MAX_ATTEMPTS = 3;
export const REMINDER_GRACE_MINUTES = {
  MORNING_WEIGHT: 180,
  HYDRATION: 180,
  STEPS: 180,
  DAILY_QUEST: 1_439,
  WEEKLY_REPORT: 1_439,
} as const;

export interface NotificationCandidate {
  readonly type: NotificationType;
  readonly dedupeKey: string;
  readonly title: string;
  readonly body: string;
  readonly privateTitle: string | null;
  readonly privateBody: string | null;
  readonly actionRoute: string;
  readonly sourceType: "TIME_BASED" | "EVENT_BASED";
  readonly sourceKey: string | null;
  readonly challengeDay: number | null;
  readonly challengeWeek: number | null;
  readonly sourceDate: string | null;
  readonly priority: NotificationPriority;
  readonly reminderSlot: string | null;
}

export interface ReminderRuleState {
  readonly key: string;
  readonly name: string;
  readonly type: "BOOLEAN" | "NUMERIC_MINIMUM" | "LOGGING_REQUIREMENT";
  readonly target: number | null;
  readonly actual: boolean | number | null;
  readonly state: "PASS" | "FAIL" | "NOT_RECORDED" | "NOT_APPLICABLE";
}

export interface TimeBasedNotificationContext {
  readonly localDate: string;
  readonly localTime: string;
  readonly challengeActive: boolean;
  readonly challengeDay: number | null;
  readonly challengeWeek: number | null;
  readonly configuredDailyRuleCount: number;
  readonly quest: {
    readonly isPerfectDay: boolean;
    readonly completedRequiredRules: number;
    readonly totalRequiredRules: number;
    readonly rules: readonly ReminderRuleState[];
  } | null;
  readonly weightLogged: boolean;
  readonly workout: {
    readonly state: string;
    readonly completedWorkoutDays: number;
    readonly requiredWorkoutDays: number;
    readonly workoutsRemaining: number;
    readonly daysRemaining: number;
  } | null;
  readonly activeRecoveries: readonly {
    readonly id: string;
    readonly type: "DAILY_RECOVERY" | "WORKOUT_RECOVERY";
  }[];
  readonly finalReportWeeks: readonly number[];
  readonly preferences: NotificationPreferencesInput;
  readonly existingDedupeKeys: ReadonlySet<string>;
}

export interface EventNotificationContext {
  readonly preferences: NotificationPreferencesInput;
  readonly existingDedupeKeys: ReadonlySet<string>;
  readonly achievements: readonly {
    readonly key: string;
    readonly name: string;
    readonly challengeDay: number | null;
    readonly challengeWeek: number | null;
  }[];
  readonly rewards: readonly {
    readonly key: string;
    readonly title: string;
    readonly challengeDay: number | null;
    readonly challengeWeek: number | null;
  }[];
  readonly completedRecoveries: readonly {
    readonly id: string;
    readonly type: "DAILY_RECOVERY" | "WORKOUT_RECOVERY";
    readonly challengeWeek: number | null;
  }[];
  readonly level: number;
  readonly rank: string;
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour! * 60 + minute!;
}

export function isDailyQuestEmailWindow(localTime: string) {
  const minute = timeToMinutes(localTime);
  return (
    minute >= DAILY_QUEST_EMAIL_WINDOW.startMinute &&
    minute < DAILY_QUEST_EMAIL_WINDOW.endMinute
  );
}

export function getZonedDateTime(instant: Date, timezone: string) {
  if (Number.isNaN(instant.getTime())) throw new RangeError("Invalid instant.");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return {
    localDate: `${value("year")}-${value("month")}-${value("day")}`,
    localTime: `${value("hour")}:${value("minute")}`,
  } as const;
}

export function isInsideQuietHours(
  currentLocalTime: string,
  quietHours: NotificationPreferencesInput["quietHours"],
) {
  if (!quietHours.enabled) return false;
  const current = timeToMinutes(currentLocalTime);
  const start = timeToMinutes(quietHours.startLocalTime);
  const end = timeToMinutes(quietHours.endLocalTime);
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}

export function isReminderSlotDue(
  currentLocalTime: string,
  reminderTime: string,
  graceMinutes: number,
) {
  const elapsed = timeToMinutes(currentLocalTime) - timeToMinutes(reminderTime);
  return elapsed >= 0 && elapsed <= graceMinutes;
}

const CEILING_PRIORITY: Readonly<Record<NotificationType, number>> = {
  WORKOUT_CRITICAL: 0,
  DAILY_QUEST: 1,
  RECOVERY: 2,
  MORNING_WEIGHT: 3,
  HYDRATION: 4,
  STEPS: 5,
  WORKOUT_AT_RISK: 6,
  WORKOUT_FAILED: 7,
  WEEKLY_REPORT_READY: 8,
  RECOVERY_CLEARED: 9,
  ACHIEVEMENT: 10,
  REWARD: 11,
  LEVEL_UP: 12,
  RANK_UP: 13,
};

function slotIsDeliverable(
  slot: string,
  quietHours: NotificationPreferencesInput["quietHours"],
) {
  return !isInsideQuietHours(slot, quietHours);
}

function eligible(
  candidate: NotificationCandidate,
  existing: ReadonlySet<string>,
): NotificationCandidate | null {
  return existing.has(candidate.dedupeKey) ? null : candidate;
}

export function evaluateTimeBasedNotifications(
  context: TimeBasedNotificationContext,
): readonly NotificationCandidate[] {
  const { preferences } = context;
  if (!preferences.enabled || !context.challengeActive) return [];
  if (isInsideQuietHours(context.localTime, preferences.quietHours)) return [];
  const candidates: NotificationCandidate[] = [];
  const push = (candidate: NotificationCandidate) => {
    const available = eligible(candidate, context.existingDedupeKeys);
    if (available) candidates.push(available);
  };
  const quest = context.quest;
  const totalRequired = quest?.totalRequiredRules ?? context.configuredDailyRuleCount;
  const completed = quest?.completedRequiredRules ?? 0;

  if (
    preferences.dailyQuest.enabled &&
    !quest?.isPerfectDay &&
    totalRequired > 0 &&
    slotIsDeliverable(preferences.dailyQuest.time, preferences.quietHours) &&
    isReminderSlotDue(
      context.localTime,
      preferences.dailyQuest.time,
      REMINDER_GRACE_MINUTES.DAILY_QUEST,
    )
  ) {
    const actionable =
      quest?.rules.filter(
        (rule) =>
          rule.state === "NOT_RECORDED" ||
          (rule.type === "NUMERIC_MINIMUM" && rule.state === "FAIL"),
      ) ?? [];
    push({
      type: "DAILY_QUEST",
      dedupeKey: `daily-quest:${context.localDate}:${preferences.dailyQuest.time}`,
      title: "WINTER ARC",
      body: `DAILY QUEST INCOMPLETE — ${completed} / ${totalRequired} REQUIRED TASKS CLEARED. Open the System to review remaining objectives.`,
      privateTitle: "DAILY QUEST INCOMPLETE",
      privateBody: actionable.length
        ? `Actionable items: ${actionable.map((rule) => rule.name).join(", ")}.`
        : `${Math.max(totalRequired - completed, 0)} Daily Quest items remain.`,
      actionRoute: "/today",
      sourceType: "TIME_BASED",
      sourceKey: context.localDate,
      challengeDay: context.challengeDay,
      challengeWeek: context.challengeWeek,
      sourceDate: context.localDate,
      priority: "NORMAL",
      reminderSlot: preferences.dailyQuest.time,
    });
  }

  if (
    preferences.morningWeight.enabled &&
    !context.weightLogged &&
    slotIsDeliverable(preferences.morningWeight.time, preferences.quietHours) &&
    isReminderSlotDue(
      context.localTime,
      preferences.morningWeight.time,
      REMINDER_GRACE_MINUTES.MORNING_WEIGHT,
    )
  )
    push({
      type: "MORNING_WEIGHT",
      dedupeKey: `morning-weight:${context.localDate}:${preferences.morningWeight.time}`,
      title: "MORNING WEIGHT",
      body: "TODAY'S CHECK-IN HAS NOT BEEN RECORDED.",
      privateTitle: null,
      privateBody: null,
      actionRoute: "/today",
      sourceType: "TIME_BASED",
      sourceKey: context.localDate,
      challengeDay: context.challengeDay,
      challengeWeek: context.challengeWeek,
      sourceDate: context.localDate,
      priority: "NORMAL",
      reminderSlot: preferences.morningWeight.time,
    });

  const hydration = quest?.rules.find((rule) => rule.key === "hydration");
  if (
    preferences.hydration.enabled &&
    hydration &&
    hydration.state !== "PASS" &&
    hydration.state !== "NOT_APPLICABLE" &&
    hydration.target !== null
  )
    for (const slot of preferences.hydration.times) {
      if (!slotIsDeliverable(slot, preferences.quietHours)) continue;
      if (!isReminderSlotDue(context.localTime, slot, REMINDER_GRACE_MINUTES.HYDRATION))
        continue;
      const actual = typeof hydration.actual === "number" ? hydration.actual : 0;
      const remaining = Math.max(hydration.target - actual, 0);
      push({
        type: "HYDRATION",
        dedupeKey: `hydration:${context.localDate}:${slot}`,
        title: "HYDRATION",
        body:
          preferences.privacyMode === "DETAILED"
            ? `${actual.toFixed(1)} / ${hydration.target.toFixed(1)} L RECORDED. ${remaining.toFixed(1)} L REMAINS FOR TODAY'S CHALLENGE TARGET.`
            : "TODAY'S CHALLENGE HYDRATION TARGET REMAINS INCOMPLETE.",
        privateTitle: "HYDRATION",
        privateBody: `${actual.toFixed(1)} / ${hydration.target.toFixed(1)} L recorded; ${remaining.toFixed(1)} L remains for the configured challenge target.`,
        actionRoute: "/today",
        sourceType: "TIME_BASED",
        sourceKey: `hydration:${context.localDate}`,
        challengeDay: context.challengeDay,
        challengeWeek: context.challengeWeek,
        sourceDate: context.localDate,
        priority: "NORMAL",
        reminderSlot: slot,
      });
    }

  const steps = quest?.rules.find((rule) => rule.key === "steps");
  if (
    preferences.steps.enabled &&
    steps &&
    steps.state !== "PASS" &&
    steps.state !== "NOT_APPLICABLE" &&
    steps.target !== null &&
    slotIsDeliverable(preferences.steps.time, preferences.quietHours) &&
    isReminderSlotDue(
      context.localTime,
      preferences.steps.time,
      REMINDER_GRACE_MINUTES.STEPS,
    )
  ) {
    const actual = typeof steps.actual === "number" ? steps.actual : 0;
    push({
      type: "STEPS",
      dedupeKey: `steps:${context.localDate}:${preferences.steps.time}`,
      title: "DAILY MOVEMENT",
      body:
        preferences.privacyMode === "DETAILED"
          ? `${actual.toLocaleString("en-US")} / ${steps.target.toLocaleString("en-US")} STEPS RECORDED. Open the System to review today's target.`
          : "TODAY'S CONFIGURED MOVEMENT TARGET REMAINS INCOMPLETE.",
      privateTitle: "DAILY MOVEMENT",
      privateBody: `${actual.toLocaleString("en-US")} / ${steps.target.toLocaleString("en-US")} steps recorded.`,
      actionRoute: "/today",
      sourceType: "TIME_BASED",
      sourceKey: `steps:${context.localDate}`,
      challengeDay: context.challengeDay,
      challengeWeek: context.challengeWeek,
      sourceDate: context.localDate,
      priority: "NORMAL",
      reminderSlot: preferences.steps.time,
    });
  }

  if (preferences.workout.enabled && context.workout) {
    const workout = context.workout;
    if (workout.state === "AT_RISK")
      push({
        type: "WORKOUT_AT_RISK",
        dedupeKey: `workout:week-${context.challengeWeek}:at-risk`,
        title: "WEEKLY MISSION AT RISK",
        body: `${workout.workoutsRemaining} TRAINING DAYS REMAIN. ${workout.daysRemaining} DAYS AVAILABLE.`,
        privateTitle: null,
        privateBody: null,
        actionRoute: "/workouts",
        sourceType: "TIME_BASED",
        sourceKey: `week-${context.challengeWeek}:at-risk`,
        challengeDay: context.challengeDay,
        challengeWeek: context.challengeWeek,
        sourceDate: context.localDate,
        priority: "NORMAL",
        reminderSlot: null,
      });
    else if (
      workout.state === "CRITICAL" &&
      workout.workoutsRemaining > 0 &&
      workout.workoutsRemaining === workout.daysRemaining
    )
      push({
        type: "WORKOUT_CRITICAL",
        dedupeKey: `workout:week-${context.challengeWeek}:critical`,
        title: "SYSTEM WARNING",
        body: `NO REST DAYS REMAIN. ${workout.workoutsRemaining} TRAINING DAYS REQUIRED. ${workout.daysRemaining} DAYS AVAILABLE.`,
        privateTitle: null,
        privateBody: null,
        actionRoute: "/workouts",
        sourceType: "TIME_BASED",
        sourceKey: `week-${context.challengeWeek}:critical`,
        challengeDay: context.challengeDay,
        challengeWeek: context.challengeWeek,
        sourceDate: context.localDate,
        priority: "HIGH",
        reminderSlot: null,
      });
    else if (workout.state === "FAILED")
      push({
        type: "WORKOUT_FAILED",
        dedupeKey: `workout:week-${context.challengeWeek}:cannot-secure`,
        title: "WEEKLY MISSION CANNOT BE SECURED",
        body: "Continue tracking normally. Recovery will use the normal configured target.",
        privateTitle: null,
        privateBody: null,
        actionRoute: "/workouts",
        sourceType: "TIME_BASED",
        sourceKey: `week-${context.challengeWeek}:cannot-secure`,
        challengeDay: context.challengeDay,
        challengeWeek: context.challengeWeek,
        sourceDate: context.localDate,
        priority: "NORMAL",
        reminderSlot: null,
      });
  }

  if (preferences.recovery.enabled)
    for (const recovery of context.activeRecoveries)
      push({
        type: "RECOVERY",
        dedupeKey: `recovery:${recovery.id}:${context.localDate}`,
        title:
          recovery.type === "DAILY_RECOVERY"
            ? "RECOVERY MODE ACTIVE"
            : "TRAINING RECOVERY ACTIVE",
        body:
          recovery.type === "DAILY_RECOVERY"
            ? "OBJECTIVE: CLEAR ONE PERFECT DAY."
            : "OBJECTIVE: SECURE THE NORMAL WEEKLY TRAINING TARGET.",
        privateTitle: null,
        privateBody: null,
        actionRoute: "/status",
        sourceType: "TIME_BASED",
        sourceKey: recovery.id,
        challengeDay: context.challengeDay,
        challengeWeek: context.challengeWeek,
        sourceDate: context.localDate,
        priority: "NORMAL",
        reminderSlot: null,
      });

  if (
    preferences.weeklyReport.enabled &&
    slotIsDeliverable(preferences.weeklyReport.time, preferences.quietHours) &&
    isReminderSlotDue(
      context.localTime,
      preferences.weeklyReport.time,
      REMINDER_GRACE_MINUTES.WEEKLY_REPORT,
    )
  )
    for (const week of context.finalReportWeeks)
      push({
        type: "WEEKLY_REPORT_READY",
        dedupeKey: `weekly-report:week-${week}`,
        title: "WEEKLY REPORT READY",
        body: `WEEK ${week} SYSTEM EVALUATION AVAILABLE.`,
        privateTitle: null,
        privateBody: null,
        actionRoute: `/reports/week/${week}`,
        sourceType: "TIME_BASED",
        sourceKey: `week-${week}`,
        challengeDay: context.challengeDay,
        challengeWeek: week,
        sourceDate: context.localDate,
        priority: "LOW",
        reminderSlot: preferences.weeklyReport.time,
      });

  return candidates.sort(
    (left, right) =>
      CEILING_PRIORITY[left.type] - CEILING_PRIORITY[right.type] ||
      left.type.localeCompare(right.type) ||
      left.dedupeKey.localeCompare(right.dedupeKey),
  );
}

export function evaluateEventNotifications(
  context: EventNotificationContext,
): readonly NotificationCandidate[] {
  if (!context.preferences.enabled) return [];
  const candidates: NotificationCandidate[] = [];
  const push = (candidate: NotificationCandidate) => {
    const available = eligible(candidate, context.existingDedupeKeys);
    if (available) candidates.push(available);
  };
  for (const achievement of context.preferences.achievementReward.enabled
    ? context.achievements
    : []) {
    const sensitive = /no[_ -]?fap|sexual/i.test(achievement.key);
    push({
      type: "ACHIEVEMENT",
      dedupeKey: `achievement:${achievement.key}`,
      title: "ACHIEVEMENT UNLOCKED",
      body: sensitive
        ? "PRIVATE DISCIPLINE MILESTONE CLEARED. Open the app to view it."
        : "A NEW SYSTEM ACHIEVEMENT IS AVAILABLE. Open the app to view it.",
      privateTitle: achievement.name,
      privateBody: "System achievement unlocked.",
      actionRoute: "/achievements",
      sourceType: "EVENT_BASED",
      sourceKey: achievement.key,
      challengeDay: achievement.challengeDay,
      challengeWeek: achievement.challengeWeek,
      sourceDate: null,
      priority: "LOW",
      reminderSlot: null,
    });
  }
  for (const reward of context.preferences.achievementReward.enabled
    ? context.rewards
    : [])
    push({
      type: "REWARD",
      dedupeKey: `reward:${reward.key}`,
      title: "SYSTEM REWARD",
      body: "NEW DIGITAL REWARD UNLOCKED.",
      privateTitle: reward.title,
      privateBody: "Digital System recognition granted.",
      actionRoute: "/rewards",
      sourceType: "EVENT_BASED",
      sourceKey: reward.key,
      challengeDay: reward.challengeDay,
      challengeWeek: reward.challengeWeek,
      sourceDate: null,
      priority: "LOW",
      reminderSlot: null,
    });
  for (const recovery of context.preferences.recovery.enabled
    ? context.completedRecoveries
    : [])
    push({
      type: "RECOVERY_CLEARED",
      dedupeKey: `recovery-cleared:${recovery.id}`,
      title: "RECOVERY CLEARED",
      body: "SYSTEM STATUS RESTORED.",
      privateTitle: null,
      privateBody: null,
      actionRoute: "/status",
      sourceType: "EVENT_BASED",
      sourceKey: recovery.id,
      challengeDay: null,
      challengeWeek: recovery.challengeWeek,
      sourceDate: null,
      priority: "NORMAL",
      reminderSlot: null,
    });
  if (context.preferences.achievementReward.enabled && context.level > 1)
    push({
      type: "LEVEL_UP",
      dedupeKey: `level:${context.level}`,
      title: "SYSTEM ADVANCEMENT",
      body: `LEVEL ${context.level} REACHED.`,
      privateTitle: null,
      privateBody: null,
      actionRoute: "/status",
      sourceType: "EVENT_BASED",
      sourceKey: `level-${context.level}`,
      challengeDay: null,
      challengeWeek: null,
      sourceDate: null,
      priority: "LOW",
      reminderSlot: null,
    });
  if (context.preferences.achievementReward.enabled && context.rank !== "E")
    push({
      type: "RANK_UP",
      dedupeKey: `rank:${context.rank}`,
      title: "RANK ADVANCEMENT",
      body: `RANK ${context.rank} REACHED.`,
      privateTitle: null,
      privateBody: null,
      actionRoute: "/status",
      sourceType: "EVENT_BASED",
      sourceKey: `rank-${context.rank}`,
      challengeDay: null,
      challengeWeek: null,
      sourceDate: null,
      priority: "LOW",
      reminderSlot: null,
    });
  return candidates;
}
