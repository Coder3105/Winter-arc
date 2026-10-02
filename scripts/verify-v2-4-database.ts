import { createHash } from "node:crypto";
import mongoose from "mongoose";

import { connectToDatabase } from "../src/server/db/mongoose";
import { BodyCompositionAssessmentModel } from "../src/server/models/body-composition-assessment";
import { DailyQuestRecordModel } from "../src/server/models/daily-quest-record";
import { EmailOtpModel } from "../src/server/models/email-otp";
import { GuildConnectionModel } from "../src/server/models/guild-connection";
import { GuildInviteModel } from "../src/server/models/guild-invite";
import { GuildSharingPreferencesModel } from "../src/server/models/guild-sharing-preferences";
import { OwnerModel } from "../src/server/models/owner";
import { ProgressionEventModel } from "../src/server/models/progression-event";
import { UserProfileModel } from "../src/server/models/user-profile";
import { WeeklyReportModel } from "../src/server/models/weekly-report";
import { WinterArcConfigModel } from "../src/server/models/winter-arc-config";

function sameKey(actual: object, expected: object) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

async function originalOwnerFingerprint() {
  const owner = await OwnerModel.findOne({ isOriginalOwner: true }).select("_id").lean();
  if (!owner) return null;
  const userId = owner._id;
  const [profile, configs, assessments, quests, progression, reports] = await Promise.all(
    [
      UserProfileModel.findOne({ userId }).lean(),
      WinterArcConfigModel.find({ userId }).sort({ createdAt: 1 }).lean(),
      BodyCompositionAssessmentModel.find({ userId }).sort({ assessmentDate: 1 }).lean(),
      DailyQuestRecordModel.find({ userId }).sort({ date: 1 }).lean(),
      ProgressionEventModel.find({ userId }).sort({ createdAt: 1 }).lean(),
      WeeklyReportModel.find({ userId }).sort({ challengeWeek: 1 }).lean(),
    ],
  );
  return createHash("sha256")
    .update(
      JSON.stringify({ profile, configs, assessments, quests, progression, reports }),
    )
    .digest("hex");
}

async function main() {
  await connectToDatabase();
  const [ownerBefore, inviteCountBefore, connectionCountBefore, sharingCountBefore] =
    await Promise.all([
      originalOwnerFingerprint(),
      GuildInviteModel.countDocuments({}),
      GuildConnectionModel.countDocuments({}),
      GuildSharingPreferencesModel.countDocuments({}),
    ]);
  await Promise.all([
    EmailOtpModel.init(),
    GuildInviteModel.init(),
    GuildConnectionModel.init(),
    GuildSharingPreferencesModel.init(),
  ]);
  const [otpIndexes, inviteIndexes, connectionIndexes, sharingIndexes] =
    await Promise.all([
      EmailOtpModel.collection.indexes(),
      GuildInviteModel.collection.indexes(),
      GuildConnectionModel.collection.indexes(),
      GuildSharingPreferencesModel.collection.indexes(),
    ]);
  const contextualOtp = otpIndexes.some(
    (index) =>
      index.unique === true &&
      sameKey(index.key, { emailNormalized: 1, purpose: 1, contextKey: 1 }),
  );
  const legacyOtp = otpIndexes.some((index) => index.name === "unique_email_otp_purpose");
  const pendingInvite = inviteIndexes.some(
    (index) =>
      index.unique === true &&
      index.name === "unique_pending_guild_invite_target" &&
      sameKey(index.key, { inviterUserId: 1, inviteeEmailNormalized: 1 }),
  );
  const pair = connectionIndexes.some(
    (index) =>
      index.unique === true &&
      index.name === "unique_guild_pair" &&
      sameKey(index.key, { pairKey: 1 }),
  );
  const preferences = sharingIndexes.some(
    (index) =>
      index.unique === true &&
      index.name === "unique_guild_sharing_owner" &&
      sameKey(index.key, { userId: 1 }),
  );
  const [ownerAfter, inviteCountAfter, connectionCountAfter, sharingCountAfter] =
    await Promise.all([
      originalOwnerFingerprint(),
      GuildInviteModel.countDocuments({}),
      GuildConnectionModel.countDocuments({}),
      GuildSharingPreferencesModel.countDocuments({}),
    ]);
  if (
    !ownerBefore ||
    ownerBefore !== ownerAfter ||
    inviteCountBefore !== inviteCountAfter ||
    connectionCountBefore !== connectionCountAfter ||
    sharingCountBefore !== sharingCountAfter ||
    !contextualOtp ||
    legacyOtp ||
    !pendingInvite ||
    !pair ||
    !preferences
  ) {
    throw new Error("V2_4_DATABASE_CONTRACT_INVALID");
  }
  console.log(
    JSON.stringify({
      databaseVerification: "PASS",
      originalOwnerPreserved: true,
      guildDocumentsCreated: 0,
      sourceDocumentsMutated: 0,
      guildInviteIndexes: "PASS",
      guildConnectionIndexes: "PASS",
      guildSharingIndexes: "PASS",
      emailOtpGuildContext: "PASS",
      secretsLogged: false,
    }),
  );
}

main()
  .catch(() => {
    console.error(
      "V2.4 database verification failed. Run migrate:v2.4 and check Atlas index permissions; no raw database error was logged.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
