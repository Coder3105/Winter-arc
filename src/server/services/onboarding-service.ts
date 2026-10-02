import "server-only";

import type { DailyRuleConfiguration } from "@/features/winter-arc/rules";
import { getDailyRuleDefinition, type DailyRuleKey } from "@/features/winter-arc/rules";
import type {
  OnboardingActivationInput,
  OnboardingDraftInput,
} from "@/lib/validation/onboarding";
import { calculateProtocolEndDate, parseCalendarDate } from "@/lib/utils/calendar-date";
import { connectToDatabase } from "@/server/db/mongoose";
import { AppError } from "@/server/errors/app-error";
import {
  OnboardingOperationError,
  type OnboardingStage,
} from "@/server/errors/onboarding-error-handler";
import { OnboardingDraftModel } from "@/server/models/onboarding-draft";
import { OwnerModel } from "@/server/models/owner";
import { UserProfileModel } from "@/server/models/user-profile";
import { WinterArcConfigModel } from "@/server/models/winter-arc-config";

export interface OnboardingDraftDto extends OnboardingDraftInput {
  readonly updatedAt: string;
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

function toDraftDto(
  draft: Awaited<ReturnType<typeof OnboardingDraftModel.findOne>>,
): OnboardingDraftDto | null {
  if (!draft) return null;
  return {
    displayName: draft.displayName,
    heightCm: draft.heightCm,
    currentWeightKg: draft.currentWeightKg,
    targetWeightKg: draft.targetWeightKg,
    ageAtBaseline: draft.ageAtBaseline,
    sex: draft.sex,
    timezone: draft.timezone,
    startDate: draft.startDate,
    weeklyWorkoutTarget: draft.weeklyWorkoutTarget,
    rules: draft.rules.map((rule) => ({
      key: rule.key as DailyRuleKey,
      target: rule.target,
    })),
    updatedAt: draft.updatedAt.toISOString(),
  };
}

function configuredRules(
  selections: OnboardingActivationInput["rules"],
): DailyRuleConfiguration[] {
  return selections
    .map((selection) => {
      const definition = getDailyRuleDefinition(selection.key);
      if (!definition) throw new AppError("VALIDATION_ERROR");
      return {
        key: definition.key,
        name: definition.name,
        category: definition.category,
        enabled: true,
        type: definition.type,
        target: definition.target ? selection.target : null,
        unit: definition.unit,
        requiredFrequency: 7,
        order: definition.order,
      } satisfies DailyRuleConfiguration;
    })
    .sort((left, right) => left.order - right.order);
}

export async function getOnboardingDraft(
  userId: string,
): Promise<OnboardingDraftDto | null> {
  await connectToDatabase();
  return toDraftDto(await OnboardingDraftModel.findOne({ userId }));
}

export async function saveOnboardingDraft(
  userId: string,
  input: OnboardingDraftInput,
): Promise<OnboardingDraftDto> {
  await connectToDatabase();
  const active = await WinterArcConfigModel.exists({ userId, status: "ACTIVE" });
  if (active) throw new AppError("CONFLICT");
  const draft = await OnboardingDraftModel.findOneAndUpdate(
    { userId },
    { $set: input, $setOnInsert: { userId } },
    { upsert: true, returnDocument: "after", runValidators: true },
  );
  const dto = toDraftDto(draft);
  if (!dto) throw new AppError("INTERNAL_ERROR");
  return dto;
}

export async function activateOnboarding(
  userId: string,
  input: OnboardingActivationInput,
) {
  if (!input.timezone || !input.startDate || input.weeklyWorkoutTarget === null) {
    throw new AppError("VALIDATION_ERROR");
  }
  let stage: OnboardingStage = "database_connection";
  try {
    await connectToDatabase();
    stage = "config_indexes";
    await WinterArcConfigModel.init();

    stage = "active_config_lookup";
    const alreadyActive = await WinterArcConfigModel.findOne({
      userId,
      status: "ACTIVE",
    });
    if (alreadyActive) {
      return { configId: alreadyActive._id.toString(), alreadyActive: true } as const;
    }

    stage = "profile_write";
    await UserProfileModel.findOneAndUpdate(
      { userId },
      {
        $set: {
          displayName: input.displayName,
          dateOfBirth: null,
          ageAtBaseline: input.ageAtBaseline,
          sex: input.sex,
          heightCm: input.heightCm,
          preferredWeightUnit: "kg",
          preferredDistanceUnit: "km",
          timezone: input.timezone,
        },
        $setOnInsert: { userId },
      },
      { upsert: true, returnDocument: "after", runValidators: true },
    );

    stage = "config_write";
    const startDate = parseCalendarDate(input.startDate);
    const insertion = {
      userId,
      name: "Winter Arc",
      durationDays: 90,
      startDate,
      endDate: calculateProtocolEndDate(startDate, 90),
      status: "ACTIVE" as const,
      startingWeightKg: input.currentWeightKg,
      targetWeightKg: input.targetWeightKg,
      weeklyWorkoutTarget: input.weeklyWorkoutTarget,
      rules: configuredRules(input.rules),
      notificationPreferences: { enabled: false },
    };

    let config;
    try {
      config = await WinterArcConfigModel.findOneAndUpdate(
        { userId, status: "ACTIVE" },
        { $setOnInsert: insertion },
        {
          upsert: true,
          returnDocument: "after",
          runValidators: true,
          setDefaultsOnInsert: true,
        },
      );
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      config = await WinterArcConfigModel.findOne({ userId, status: "ACTIVE" });
      // Only a winning concurrent activation is recoverable. Preserve other index conflicts.
      if (!config) throw error;
    }
    if (!config) throw new AppError("INTERNAL_ERROR");

    stage = "finalize";
    await Promise.all([
      OwnerModel.updateOne({ _id: userId }, { $set: { displayName: input.displayName } }),
      OnboardingDraftModel.deleteOne({ userId }),
    ]);

    return { configId: config._id.toString(), alreadyActive: false } as const;
  } catch (error) {
    throw new OnboardingOperationError(stage, error);
  }
}
