import "server-only";

import type { BodyCompositionInput } from "@/lib/validation/body-composition";
import { connectToDatabase } from "@/server/db/mongoose";
import { AppError } from "@/server/errors/app-error";
import {
  BodyCompositionAssessmentModel,
  type BodyCompositionAssessmentDocument,
} from "@/server/models/body-composition-assessment";
import { WinterArcConfigModel } from "@/server/models/winter-arc-config";

export interface BodyCompositionDto extends Omit<BodyCompositionInput, "assessmentDate"> {
  readonly id: string;
  readonly assessmentDate: string;
  readonly winterArcConfigId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

function toBodyCompositionDto(
  assessment: BodyCompositionAssessmentDocument,
): BodyCompositionDto {
  return {
    id: assessment._id.toString(),
    winterArcConfigId: assessment.winterArcConfigId?.toString() ?? null,
    source: assessment.source,
    assessmentDate: assessment.assessmentDate.toISOString(),
    isBaseline: assessment.isBaseline,
    notes: assessment.notes,
    measurements: assessment.measurements,
    segmentalLean: assessment.segmentalLean,
    segmentalFat: assessment.segmentalFat,
    impedance: assessment.impedance,
    createdAt: assessment.createdAt.toISOString(),
    updatedAt: assessment.updatedAt.toISOString(),
  };
}

export async function listBodyCompositionAssessments(
  userId: string,
): Promise<BodyCompositionDto[]> {
  await connectToDatabase();
  const assessments = await BodyCompositionAssessmentModel.find({ userId }).sort({
    assessmentDate: -1,
  });
  return assessments.map(toBodyCompositionDto);
}

export async function getBaselineAssessment(
  userId: string,
): Promise<BodyCompositionDto | null> {
  await connectToDatabase();
  const assessment = await BodyCompositionAssessmentModel.findOne({
    userId,
    isBaseline: true,
  }).sort({ assessmentDate: -1 });
  return assessment ? toBodyCompositionDto(assessment) : null;
}

export async function getLatestAssessment(
  userId: string,
): Promise<BodyCompositionDto | null> {
  await connectToDatabase();
  const assessment = await BodyCompositionAssessmentModel.findOne({ userId }).sort({
    assessmentDate: -1,
    _id: -1,
  });
  return assessment ? toBodyCompositionDto(assessment) : null;
}

export async function createBodyCompositionAssessment(
  userId: string,
  input: BodyCompositionInput,
): Promise<BodyCompositionDto> {
  await connectToDatabase();
  const activeConfig = await WinterArcConfigModel.findOne({
    userId,
    status: "ACTIVE",
  }).sort({
    createdAt: -1,
  });

  if (input.isBaseline) {
    const existingBaseline = await BodyCompositionAssessmentModel.exists({
      userId,
      winterArcConfigId: activeConfig?._id ?? null,
      isBaseline: true,
    });
    if (existingBaseline) {
      throw new AppError("CONFLICT");
    }
  }

  const assessment = await BodyCompositionAssessmentModel.create({
    ...input,
    userId,
    winterArcConfigId: activeConfig?._id ?? null,
    assessmentDate: new Date(input.assessmentDate),
  });
  return toBodyCompositionDto(assessment);
}
