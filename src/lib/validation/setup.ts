import { profileInputSchema } from "./profile";
import { winterArcInputSchema } from "./winter-arc";

export interface SetupIssue {
  readonly step: number;
  readonly field: string;
  readonly message: string;
}

const LABELS: Record<string, string> = {
  displayName: "Display name",
  ageAtBaseline: "Age at baseline",
  heightCm: "Height",
  sex: "Sex",
  timezone: "Timezone",
  dateOfBirth: "Date of birth",
  preferredWeightUnit: "Weight unit",
  preferredDistanceUnit: "Distance unit",
  name: "Challenge name",
  durationDays: "Duration",
  startDate: "Start date",
  startingWeightKg: "Starting weight",
  targetWeightKg: "Goal weight",
  weeklyWorkoutTarget: "Weekly workout requirement",
  rules: "Daily rules",
};

/** Validate previous steps before navigation, and all inputs before either write. */
export function getSetupIssue(
  profile: unknown,
  config: unknown,
  throughStep = 2,
): SetupIssue | null {
  const identity = profileInputSchema.safeParse(profile);
  if (!identity.success) {
    const issue = identity.error.issues[0];
    if (!issue)
      return { step: 0, field: "profile", message: "Review your profile fields." };
    const field = String(issue.path[0]);
    return { step: 0, field, message: `${LABELS[field] ?? field}: ${issue.message}` };
  }
  if (throughStep === 0) return null;
  const protocol = winterArcInputSchema.safeParse(config);
  if (!protocol.success) {
    const issue = protocol.error.issues.find(
      (item) => throughStep >= 2 || item.path[0] !== "rules",
    );
    if (issue) {
      const field = String(issue.path[0]);
      const rule =
        field === "rules" && typeof issue.path[1] === "number"
          ? ` (rule ${issue.path[1] + 1})`
          : "";
      return {
        step: field === "rules" ? 2 : 1,
        field,
        message: `${LABELS[field] ?? field}${rule}: ${issue.message}`,
      };
    }
  }
  return null;
}

export async function setupSaveError(
  response: Response,
  section: string,
): Promise<string> {
  if (response.status === 400)
    return `${section} was rejected. Review its fields and try again.`;
  if (response.status >= 500)
    return `The server could not save ${section.toLowerCase()}. Please try again shortly.`;
  return `${section} could not be saved (HTTP ${response.status}). Please try again.`;
}
