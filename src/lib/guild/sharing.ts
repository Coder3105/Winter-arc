export const GUILD_SHARING_KEYS = [
  "shareProfileSummary",
  "shareCalendar",
  "shareWeeklyReports",
  "shareProgression",
  "shareWorkoutSummary",
  "shareWeight",
  "shareBodyComposition",
  "sharePrivateHabits",
] as const;

export type GuildSharingKey = (typeof GUILD_SHARING_KEYS)[number];

export interface GuildSharingSettings {
  readonly shareProfileSummary: boolean;
  readonly shareCalendar: boolean;
  readonly shareWeeklyReports: boolean;
  readonly shareProgression: boolean;
  readonly shareWorkoutSummary: boolean;
  readonly shareWeight: boolean;
  readonly shareBodyComposition: boolean;
  readonly sharePrivateHabits: boolean;
}

export const DEFAULT_GUILD_SHARING: GuildSharingSettings = Object.freeze({
  shareProfileSummary: true,
  shareCalendar: true,
  shareWeeklyReports: true,
  shareProgression: true,
  shareWorkoutSummary: true,
  shareWeight: false,
  shareBodyComposition: false,
  sharePrivateHabits: false,
});
