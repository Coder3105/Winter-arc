import "server-only";

import { DEFAULT_GUILD_SHARING, type GuildSharingSettings } from "@/lib/guild/sharing";
import type { GuildSharingInput } from "@/lib/validation/guild";
import { connectToDatabase } from "@/server/db/mongoose";
import {
  GuildSharingPreferencesModel,
  type GuildSharingPreferencesDocument,
} from "@/server/models/guild-sharing-preferences";

function toDto(
  preferences: GuildSharingPreferencesDocument | null,
): GuildSharingSettings {
  if (!preferences) return { ...DEFAULT_GUILD_SHARING };
  return {
    shareProfileSummary: preferences.shareProfileSummary,
    shareCalendar: preferences.shareCalendar,
    shareWeeklyReports: preferences.shareWeeklyReports,
    shareProgression: preferences.shareProgression,
    shareWorkoutSummary: preferences.shareWorkoutSummary,
    shareWeight: preferences.shareWeight,
    shareBodyComposition: preferences.shareBodyComposition,
    sharePrivateHabits: preferences.sharePrivateHabits,
  };
}

export async function getGuildSharingPreferences(
  userId: string,
): Promise<GuildSharingSettings> {
  await connectToDatabase();
  return toDto(await GuildSharingPreferencesModel.findOne({ userId }));
}

export async function updateGuildSharingPreferences(
  userId: string,
  input: GuildSharingInput,
): Promise<GuildSharingSettings> {
  await connectToDatabase();
  const preferences = await GuildSharingPreferencesModel.findOneAndUpdate(
    { userId },
    { $set: input, $setOnInsert: { userId } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );
  return toDto(preferences);
}
