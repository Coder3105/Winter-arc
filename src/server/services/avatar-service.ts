import "server-only";
import { normalizeAvatarKey } from "@/lib/avatar-catalogue";
import { avatarSelectionSchema } from "@/lib/validation/avatar";
import { connectToDatabase } from "@/server/db/mongoose";
import { AppError } from "@/server/errors/app-error";
import { UserProfileModel } from "@/server/models/user-profile";

/** Cosmetic-only update: never upserts an incomplete profile or reconciles gameplay. */
export async function updateProfileAvatar(userId: string, input: unknown) {
  const parsed = avatarSelectionSchema.safeParse(input);
  if (!parsed.success) throw new AppError("VALIDATION_ERROR");
  await connectToDatabase();
  const profile = await UserProfileModel.findOneAndUpdate(
    { userId },
    { $set: { avatarKey: parsed.data.avatarKey } },
    { returnDocument: "after", runValidators: true },
  );
  if (!profile) throw new AppError("VALIDATION_ERROR");
  return { avatarKey: normalizeAvatarKey(profile.avatarKey) };
}
