import { createHash } from "node:crypto";

import mongoose from "mongoose";

import { AVATAR_KEYS, normalizeAvatarKey } from "../src/lib/avatar-catalogue";
import { connectToDatabase } from "../src/server/db/mongoose";
import { OwnerModel } from "../src/server/models/owner";
import { UserProfileModel } from "../src/server/models/user-profile";

async function profileFingerprint() {
  const profiles = await UserProfileModel.find({}).sort({ _id: 1 }).lean();
  return createHash("sha256").update(JSON.stringify(profiles)).digest("hex");
}

async function main() {
  await connectToDatabase();
  const originalOwner = await OwnerModel.findOne({ isOriginalOwner: true })
    .select("_id")
    .lean();
  if (!originalOwner) throw new Error("ORIGINAL_OWNER_NOT_FOUND");

  const [fingerprintBefore, countBefore, originalProfile, invalidAvatarCount] =
    await Promise.all([
      profileFingerprint(),
      UserProfileModel.countDocuments({}),
      UserProfileModel.findOne({ userId: originalOwner._id }).select("avatarKey").lean(),
      UserProfileModel.countDocuments({
        avatarKey: { $exists: true, $nin: [null, ...AVATAR_KEYS] },
      }),
    ]);

  const avatarPath = UserProfileModel.schema.path("avatarKey") as unknown as {
    options: { default: unknown; enum: readonly unknown[] };
  };
  const schemaCompatible =
    avatarPath.options.default === null &&
    AVATAR_KEYS.every((key) => avatarPath.options.enum.includes(key)) &&
    avatarPath.options.enum.includes(null);

  const [fingerprintAfter, countAfter] = await Promise.all([
    profileFingerprint(),
    UserProfileModel.countDocuments({}),
  ]);
  if (
    !originalProfile ||
    !schemaCompatible ||
    invalidAvatarCount !== 0 ||
    countBefore !== countAfter ||
    fingerprintBefore !== fingerprintAfter
  ) {
    throw new Error("V2_5_DATABASE_CONTRACT_INVALID");
  }

  console.log(
    JSON.stringify({
      databaseVerification: "PASS",
      userProfileAvatarKey: "PASS",
      existingProfilesCompatible: true,
      originalOwnerPreserved: true,
      originalOwnerAvatar:
        normalizeAvatarKey(originalProfile.avatarKey) === null
          ? "SYSTEM_DEFAULT"
          : "USER_SELECTED",
      profilesCreated: 0,
      profilesMutated: 0,
      secretsLogged: false,
    }),
  );
}

main()
  .catch(() => {
    console.error(
      "V2.5 database verification failed; no raw database error was logged and no profile write was attempted.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
