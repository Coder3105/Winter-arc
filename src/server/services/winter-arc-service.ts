import "server-only";

import type { DailyRuleConfiguration } from "@/features/winter-arc/rules";
import type { WinterArcInput } from "@/lib/validation/winter-arc";
import {
  calculateProtocolEndDate,
  formatCalendarDate,
  parseCalendarDate,
} from "@/lib/utils/calendar-date";
import { connectToDatabase } from "@/server/db/mongoose";
import { BodyCompositionAssessmentModel } from "@/server/models/body-composition-assessment";
import {
  WinterArcConfigModel,
  type WinterArcConfigDocument,
} from "@/server/models/winter-arc-config";

export interface WinterArcConfigDto {
  readonly id: string;
  readonly name: string;
  readonly durationDays: number;
  readonly startDate: string;
  readonly endDate: string;
  readonly status: WinterArcConfigDocument["status"];
  readonly startingWeightKg: number | null;
  readonly targetWeightKg: number | null;
  readonly weeklyWorkoutTarget: number;
  readonly rules: DailyRuleConfiguration[];
  readonly notificationPreferences: { readonly enabled: boolean };
  readonly createdAt: string;
  readonly updatedAt: string;
}

function toWinterArcDto(config: WinterArcConfigDocument): WinterArcConfigDto {
  return {
    id: config._id.toString(),
    name: config.name,
    durationDays: config.durationDays,
    startDate: formatCalendarDate(config.startDate),
    endDate: formatCalendarDate(config.endDate),
    status: config.status,
    startingWeightKg: config.startingWeightKg,
    targetWeightKg: config.targetWeightKg,
    weeklyWorkoutTarget: config.weeklyWorkoutTarget,
    rules: config.rules.map((rule) => ({
      key: rule.key,
      name: rule.name,
      category: rule.category,
      enabled: rule.enabled,
      type: rule.type,
      target: rule.target,
      unit: rule.unit,
      requiredFrequency: rule.requiredFrequency,
      order: rule.order,
    })),
    notificationPreferences: {
      enabled: config.notificationPreferences.enabled,
    },
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString(),
  };
}

export async function getWinterArcConfig(
  userId: string,
): Promise<WinterArcConfigDto | null> {
  await connectToDatabase();
  const config = await WinterArcConfigModel.findOne({
    userId,
    status: { $in: ["DRAFT", "ACTIVE"] },
  }).sort({ createdAt: -1 });
  return config ? toWinterArcDto(config) : null;
}

export async function saveWinterArcConfig(
  userId: string,
  input: WinterArcInput,
): Promise<WinterArcConfigDto> {
  await connectToDatabase();
  const startDate = parseCalendarDate(input.startDate);
  const endDate = calculateProtocolEndDate(startDate, input.durationDays);
  const existing = await WinterArcConfigModel.findOne({
    userId,
    status: { $in: ["DRAFT", "ACTIVE"] },
  }).sort({ createdAt: -1 });

  const config = existing ?? new WinterArcConfigModel({ userId });
  config.set({ ...input, startDate, endDate });
  await config.save();

  if (input.status === "ACTIVE") {
    await BodyCompositionAssessmentModel.updateOne(
      { userId, isBaseline: true, winterArcConfigId: null },
      { $set: { winterArcConfigId: config._id } },
    );
  }

  return toWinterArcDto(config);
}
