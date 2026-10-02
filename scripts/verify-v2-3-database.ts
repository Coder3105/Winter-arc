import mongoose from "mongoose";
import { createHash } from "node:crypto";

import { connectToDatabase } from "../src/server/db/mongoose";
import { BodyCompositionAssessmentModel } from "../src/server/models/body-composition-assessment";
import { DailyQuestRecordModel } from "../src/server/models/daily-quest-record";
import { OnboardingDraftModel } from "../src/server/models/onboarding-draft";
import { OwnerModel } from "../src/server/models/owner";
import { ProgressionEventModel } from "../src/server/models/progression-event";
import { UserProfileModel } from "../src/server/models/user-profile";
import { WinterArcConfigModel } from "../src/server/models/winter-arc-config";

function sameKey(actual: object, expected: object) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

async function counts() {
  const [owners, profiles, configs, activeConfigs, assessments, quests] =
    await Promise.all([
      OwnerModel.countDocuments({}),
      UserProfileModel.countDocuments({}),
      WinterArcConfigModel.countDocuments({}),
      WinterArcConfigModel.countDocuments({ status: "ACTIVE" }),
      BodyCompositionAssessmentModel.countDocuments({}),
      DailyQuestRecordModel.countDocuments({}),
    ]);
  return { owners, profiles, configs, activeConfigs, assessments, quests };
}

async function originalOwnerFingerprint() {
  const owner = await OwnerModel.findOne({ isOriginalOwner: true }).select("_id").lean();
  if (!owner) return null;
  const userId = owner._id;
  const [profile, configs, assessments, quests, progression] = await Promise.all([
    UserProfileModel.findOne({ userId }).lean(),
    WinterArcConfigModel.find({ userId }).sort({ createdAt: 1 }).lean(),
    BodyCompositionAssessmentModel.find({ userId }).sort({ assessmentDate: 1 }).lean(),
    DailyQuestRecordModel.find({ userId }).sort({ date: 1 }).lean(),
    ProgressionEventModel.find({ userId }).sort({ createdAt: 1 }).lean(),
  ]);
  return createHash("sha256")
    .update(JSON.stringify({ profile, configs, assessments, quests, progression }))
    .digest("hex");
}

async function main() {
  await connectToDatabase();
  const [before, originalBefore] = await Promise.all([
    counts(),
    originalOwnerFingerprint(),
  ]);

  await Promise.all([OnboardingDraftModel.init(), WinterArcConfigModel.init()]);

  const [draftIndexes, configIndexes, after, draftDocuments, originalAfter] =
    await Promise.all([
      OnboardingDraftModel.collection.indexes(),
      WinterArcConfigModel.collection.indexes(),
      counts(),
      OnboardingDraftModel.countDocuments({}),
      originalOwnerFingerprint(),
    ]);

  const uniqueDraft = draftIndexes.some(
    (index) =>
      index.unique === true &&
      index.name === "unique_onboarding_draft_per_user" &&
      sameKey(index.key, { userId: 1 }),
  );
  const uniqueActive = configIndexes.some(
    (index) =>
      index.unique === true &&
      index.name === "unique_active_winter_arc_per_user" &&
      sameKey(index.key, { userId: 1 }) &&
      JSON.stringify(index.partialFilterExpression) ===
        JSON.stringify({ status: "ACTIVE" }),
  );
  if (
    !originalBefore ||
    originalBefore !== originalAfter ||
    JSON.stringify(before) !== JSON.stringify(after) ||
    !uniqueDraft ||
    !uniqueActive
  ) {
    throw new Error("V2_3_DATABASE_CONTRACT_INVALID");
  }

  console.log(
    JSON.stringify({
      databaseVerification: "PASS",
      existingDataCountsUnchanged: true,
      originalOwnerPreserved: true,
      ownerAccountsCreated: 0,
      onboardingDraftIndex: "PASS",
      activeProtocolIndex: "PASS",
      currentDraftDocuments: draftDocuments,
      sourceDocumentsMutated: 0,
      secretsLogged: false,
    }),
  );
}

main()
  .catch(() => {
    console.error(
      "V2.3 database verification failed. Check Atlas access, duplicate ACTIVE protocols, and index definitions; no raw database error was logged.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
