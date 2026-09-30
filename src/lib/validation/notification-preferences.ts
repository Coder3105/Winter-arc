import { z } from "zod";

export const LOCAL_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const localTime = z.string().regex(LOCAL_TIME_PATTERN, "Use 24-hour HH:mm format.");
const toggle = z.object({ enabled: z.boolean() }).strict();
const timedToggle = toggle.extend({ time: localTime }).strict();

export const notificationPreferencesInputSchema = z
  .object({
    enabled: z.boolean(),
    privacyMode: z.enum(["PRIVATE", "DETAILED"]),
    quietHours: z
      .object({
        enabled: z.boolean(),
        startLocalTime: localTime,
        endLocalTime: localTime,
      })
      .strict()
      .superRefine((value, context) => {
        if (value.enabled && value.startLocalTime === value.endLocalTime)
          context.addIssue({
            code: "custom",
            message: "Quiet-hour start and end must differ when enabled.",
          });
      }),
    dailyQuest: timedToggle,
    morningWeight: timedToggle,
    hydration: toggle
      .extend({
        times: z.array(localTime).max(4, "Use at most four hydration reminders."),
      })
      .strict()
      .superRefine((value, context) => {
        if (new Set(value.times).size !== value.times.length)
          context.addIssue({
            code: "custom",
            message: "Hydration reminder times must be unique.",
          });
      }),
    steps: timedToggle,
    workout: toggle,
    recovery: toggle,
    weeklyReport: timedToggle,
    achievementReward: toggle,
  })
  .strict();

export type NotificationPreferencesInput = z.infer<
  typeof notificationPreferencesInputSchema
>;

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferencesInput = {
  enabled: false,
  privacyMode: "PRIVATE",
  quietHours: {
    enabled: false,
    startLocalTime: "22:30",
    endLocalTime: "07:30",
  },
  dailyQuest: { enabled: true, time: "20:00" },
  morningWeight: { enabled: true, time: "09:00" },
  hydration: { enabled: true, times: ["14:00", "18:00"] },
  steps: { enabled: true, time: "19:00" },
  workout: { enabled: true },
  recovery: { enabled: true },
  weeklyReport: { enabled: true, time: "09:00" },
  achievementReward: { enabled: true },
};
