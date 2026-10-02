import "server-only";

import type { ProfileInput } from "@/lib/validation/profile";
import { normalizeAvatarKey, type AvatarKey } from "@/lib/avatar-catalogue";
import { connectToDatabase } from "@/server/db/mongoose";
import { UserProfileModel, type UserProfileDocument } from "@/server/models/user-profile";

export interface ProfileDto {
  readonly id: string;
  readonly displayName: string;
  readonly dateOfBirth: string | null;
  readonly ageAtBaseline: number | null;
  readonly sex: UserProfileDocument["sex"];
  readonly heightCm: number | null;
  readonly preferredWeightUnit: UserProfileDocument["preferredWeightUnit"];
  readonly preferredDistanceUnit: UserProfileDocument["preferredDistanceUnit"];
  readonly timezone: string;
  readonly selectedTitle: string | null;
  readonly avatarKey: AvatarKey | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

function toProfileDto(profile: UserProfileDocument): ProfileDto {
  return {
    id: profile._id.toString(),
    displayName: profile.displayName,
    dateOfBirth: profile.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    ageAtBaseline: profile.ageAtBaseline,
    sex: profile.sex,
    heightCm: profile.heightCm,
    preferredWeightUnit: profile.preferredWeightUnit,
    preferredDistanceUnit: profile.preferredDistanceUnit,
    timezone: profile.timezone,
    selectedTitle: profile.selectedTitle ?? null,
    avatarKey: normalizeAvatarKey(profile.avatarKey),
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

export async function getProfile(userId: string): Promise<ProfileDto | null> {
  await connectToDatabase();
  const profile = await UserProfileModel.findOne({ userId });
  return profile ? toProfileDto(profile) : null;
}

export async function saveProfile(
  userId: string,
  input: ProfileInput,
): Promise<ProfileDto> {
  await connectToDatabase();
  const profile = await UserProfileModel.findOneAndUpdate(
    { userId },
    {
      $set: {
        ...input,
        dateOfBirth: input.dateOfBirth
          ? new Date(`${input.dateOfBirth}T00:00:00.000Z`)
          : null,
      },
      $setOnInsert: { userId },
    },
    { upsert: true, returnDocument: "after", runValidators: true },
  );

  return toProfileDto(profile);
}
