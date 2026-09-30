import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/services/profile-service", () => ({ getProfile: vi.fn() }));
vi.mock("@/server/services/winter-arc-service", () => ({ getWinterArcConfig: vi.fn() }));
vi.mock("@/server/services/body-composition-service", () => ({
  getBaselineAssessment: vi.fn(),
  getLatestAssessment: vi.fn(),
}));

import { getProfile } from "@/server/services/profile-service";
import { getWinterArcConfig } from "@/server/services/winter-arc-service";
import {
  getBaselineAssessment,
  getLatestAssessment,
} from "@/server/services/body-composition-service";
import { getCalculationSummary } from "@/server/services/calculation-summary-service";
import { INBODY_BASELINE } from "@/server/seed/inbody-baseline";

describe("summary service", () => {
  beforeEach(() => vi.resetAllMocks());
  it("reads all inputs under the same owner and projects a baseline without writes", async () => {
    const baseline = {
      ...INBODY_BASELINE,
      id: "scan",
      winterArcConfigId: null,
      createdAt: "2026-09-30T00:00:00Z",
      updatedAt: "2026-09-30T00:00:00Z",
    };
    vi.mocked(getProfile).mockResolvedValue(null);
    vi.mocked(getWinterArcConfig).mockResolvedValue(null);
    vi.mocked(getBaselineAssessment).mockResolvedValue(baseline);
    vi.mocked(getLatestAssessment).mockResolvedValue(baseline);
    const summary = await getCalculationSummary(
      "owner-123",
      new Date("2026-09-30T00:00:00Z"),
    );
    for (const reader of [
      getProfile,
      getWinterArcConfig,
      getBaselineAssessment,
      getLatestAssessment,
    ])
      expect(reader).toHaveBeenCalledExactlyOnceWith("owner-123");
    expect(summary.source?.bodyFatMassKg).toBe(50.4);
    expect(summary.calculated?.bodyFatMassDerivedKg).toBeCloseTo(50.3283);
  });
});
