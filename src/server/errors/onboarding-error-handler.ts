import "server-only";

import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import type { ZodType } from "zod";

import { failureResponse } from "@/lib/validation/api-response";
import { AppError } from "./app-error";
import { handleApiError } from "./api-error-handler";

export type OnboardingStage =
  | "request"
  | "database_connection"
  | "config_indexes"
  | "active_config_lookup"
  | "profile_write"
  | "config_write"
  | "finalize";

export class OnboardingOperationError extends Error {
  constructor(
    readonly stage: OnboardingStage,
    cause: unknown,
  ) {
    super("Onboarding operation failed.", { cause });
  }
}

class OnboardingInputError extends AppError {
  constructor(readonly feedback: string) {
    super("VALIDATION_ERROR");
  }
}

const labels: Record<string, string> = {
  displayName: "Display name",
  heightCm: "Height",
  currentWeightKg: "Current weight",
  targetWeightKg: "Goal weight",
  ageAtBaseline: "Age",
  sex: "Sex",
  timezone: "Timezone",
  startDate: "Start date",
  weeklyWorkoutTarget: "Weekly workout target",
  rules: "Daily rules",
};

export async function readOnboardingInput<T>(request: Request, schema: ZodType<T>) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new OnboardingInputError("The setup request is invalid. Please retry.");
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    // Publish only schema-authored custom messages, never invalid submitted values.
    const feedback = result.error.issues.slice(0, 12).map((issue) => {
      const label = labels[String(issue.path[0])] ?? "Setup";
      return `${label}: ${issue.code === "custom" ? issue.message : "Enter a valid value."}`;
    });
    throw new OnboardingInputError([...new Set(feedback)].join(" "));
  }
  return result.data;
}

export function handleOnboardingError(error: unknown) {
  if (error instanceof OnboardingInputError) {
    return failureResponse("VALIDATION_ERROR", error.feedback, 400);
  }
  const stage = error instanceof OnboardingOperationError ? error.stage : "request";
  const cause = error instanceof OnboardingOperationError ? error.cause : error;
  if (cause instanceof AppError && cause.status < 500) return handleApiError(cause);

  const reference = randomUUID();
  const fields =
    cause instanceof mongoose.Error.ValidationError
      ? Object.entries(cause.errors).map(([path, issue]) => ({
          path: /^(rules\.\d+\.(key|name|category|enabled|type|target|unit|requiredFrequency|order)|displayName|dateOfBirth|ageAtBaseline|sex|heightCm|timezone|preferredWeightUnit|preferredDistanceUnit|userId|startDate|endDate|durationDays|startingWeightKg|targetWeightKg|weeklyWorkoutTarget)$/.test(
            path,
          )
            ? path
            : "unrecognized_field",
          validator: [
            "required",
            "min",
            "max",
            "enum",
            "minlength",
            "maxlength",
            "Number",
            "Date",
            "ObjectId",
          ].includes(issue.kind)
            ? issue.kind
            : "validation",
        }))
      : [];
  const databaseCode =
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    typeof cause.code === "number" &&
    Number.isSafeInteger(cause.code)
      ? cause.code
      : null;
  const category =
    cause instanceof mongoose.Error.ValidationError
      ? "MODEL_VALIDATION"
      : cause instanceof mongoose.Error.CastError
        ? "MODEL_CAST"
        : databaseCode === 11000
          ? "DUPLICATE_KEY"
          : databaseCode !== null
            ? "DATABASE_ERROR"
            : "UNEXPECTED_ERROR";

  // Raw errors, stacks, query filters and documents may contain credentials or health data.
  console.error("[onboarding] Request failed", {
    reference,
    stage,
    category,
    databaseCode,
    fields,
  });
  return failureResponse(
    "INTERNAL_ERROR",
    `The server could not complete setup. Your form entries are still available. Please retry. Reference: ${reference}`,
    500,
  );
}
