import mongoose, { Types } from "mongoose";

import { createDefaultDailyRules } from "../src/features/winter-arc/rules";
import { BodyCompositionAssessmentModel } from "../src/server/models/body-composition-assessment";
import { UserProfileModel } from "../src/server/models/user-profile";
import { WinterArcConfigModel } from "../src/server/models/winter-arc-config";
import { INBODY_BASELINE } from "../src/server/seed/inbody-baseline";
import {
  createBodyCompositionAssessment,
  getBaselineAssessment,
  listBodyCompositionAssessments,
} from "../src/server/services/body-composition-service";
import { getProfile, saveProfile } from "../src/server/services/profile-service";
import {
  getWinterArcConfig,
  saveWinterArcConfig,
} from "../src/server/services/winter-arc-service";

const testUserId = new Types.ObjectId().toString();
const otherUserId = new Types.ObjectId().toString();
const createdAssessmentIds: string[] = [];
let createdProfileId: string | null = null;
let createdConfigId: string | null = null;

async function verify() {
  const profile = await saveProfile(testUserId, {
    displayName: "Phase 2 Verification",
    dateOfBirth: null,
    ageAtBaseline: 24,
    sex: "male",
    heightCm: 178,
    preferredWeightUnit: "kg",
    preferredDistanceUnit: "km",
    timezone: "UTC",
  });
  createdProfileId = profile.id;

  const config = await saveWinterArcConfig(testUserId, {
    name: "Phase 2 Verification",
    durationDays: 90,
    startDate: "2099-01-01",
    status: "DRAFT",
    startingWeightKg: 111.1,
    targetWeightKg: null,
    weeklyWorkoutTarget: 4,
    rules: createDefaultDailyRules(),
    notificationPreferences: { enabled: false },
  });
  createdConfigId = config.id;

  const baseline = await createBodyCompositionAssessment(testUserId, INBODY_BASELINE);
  createdAssessmentIds.push(baseline.id);
  const laterAssessment = await createBodyCompositionAssessment(testUserId, {
    ...INBODY_BASELINE,
    assessmentDate: "2026-11-14T19:11:00.000Z",
    isBaseline: false,
  });
  createdAssessmentIds.push(laterAssessment.id);

  const [
    storedProfile,
    foreignProfile,
    storedConfig,
    foreignConfig,
    storedBaseline,
    history,
  ] = await Promise.all([
    getProfile(testUserId),
    getProfile(otherUserId),
    getWinterArcConfig(testUserId),
    getWinterArcConfig(otherUserId),
    getBaselineAssessment(testUserId),
    listBodyCompositionAssessments(testUserId),
  ]);

  console.log(
    `PROFILE_PERSISTED=${storedProfile?.displayName === "Phase 2 Verification"}`,
  );
  console.log(`PROFILE_OWNERSHIP_SCOPED=${foreignProfile === null}`);
  console.log(`CONFIG_PERSISTED=${storedConfig?.weeklyWorkoutTarget === 4}`);
  console.log(`CONFIG_OWNERSHIP_SCOPED=${foreignConfig === null}`);
  console.log(`RULE_COUNT=${storedConfig?.rules.length ?? 0}`);
  console.log(
    `WORKOUT_RULE_ABSENT=${!storedConfig?.rules.some((rule) => rule.key === "workout")}`,
  );
  console.log(`MULTIPLE_ASSESSMENTS=${history.length === 2}`);
  console.log(`BASELINE_RETRIEVED=${storedBaseline?.id === baseline.id}`);
  console.log(
    `BASELINE_NOT_OVERWRITTEN=${storedBaseline?.measurements.weightKg === 111.1}`,
  );
}

async function cleanup() {
  for (const id of createdAssessmentIds) {
    await BodyCompositionAssessmentModel.findByIdAndDelete(id);
  }
  if (createdConfigId) {
    await WinterArcConfigModel.findByIdAndDelete(createdConfigId);
  }
  if (createdProfileId) {
    await UserProfileModel.findByIdAndDelete(createdProfileId);
  }
  console.log("SCOPED_TEST_CLEANUP=PASS");
}

try {
  await verify();
} finally {
  await cleanup();
  await mongoose.disconnect();
}
