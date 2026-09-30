import "server-only";

import { buildCalculationSummary } from "@/server/calculations";
import { getBaselineAssessment, getLatestAssessment } from "./body-composition-service";
import { getProfile } from "./profile-service";
import { getWinterArcConfig } from "./winter-arc-service";

/** Clock is injected at the service boundary; all calculation functions are pure. */
export async function getCalculationContext(userId: string, currentDate = new Date()) {
  const [profile, config, baseline, latest] = await Promise.all([
    getProfile(userId),
    getWinterArcConfig(userId),
    getBaselineAssessment(userId),
    getLatestAssessment(userId),
  ]);
  const summary = buildCalculationSummary({
    profile,
    config,
    baseline,
    latest,
    currentDate,
  });
  return { profile, config, baseline, summary };
}

export async function getCalculationSummary(userId: string, currentDate = new Date()) {
  return (await getCalculationContext(userId, currentDate)).summary;
}
