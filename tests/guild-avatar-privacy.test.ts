import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  requireActive: vi.fn(),
  memberIds: vi.fn(),
  sharing: vi.fn(),
  owner: vi.fn(),
  profile: vi.fn(),
  config: vi.fn(),
  progression: vi.fn(),
  calendar: vi.fn(),
  streaks: vi.fn(),
  reportList: vi.fn(),
  report: vi.fn(),
}));

vi.mock("@/server/db/mongoose", () => ({ connectToDatabase: mocks.connect }));
vi.mock("@/server/models/owner", () => ({ OwnerModel: { findById: mocks.owner } }));
vi.mock("@/server/services/guild-connection-service", () => ({
  requireActiveGuildConnection: mocks.requireActive,
  getActiveGuildMemberIds: mocks.memberIds,
}));
vi.mock("@/server/services/guild-sharing-service", () => ({
  getGuildSharingPreferences: mocks.sharing,
}));
vi.mock("@/server/services/profile-service", () => ({ getProfile: mocks.profile }));
vi.mock("@/server/services/winter-arc-service", () => ({
  getWinterArcConfig: mocks.config,
}));
vi.mock("@/server/services/progression-service", () => ({
  getProgressionSummary: mocks.progression,
}));
vi.mock("@/server/services/history-service", () => ({
  getCalendarMonthHistory: mocks.calendar,
  getStreakHistory: mocks.streaks,
}));
vi.mock("@/server/services/weekly-report-service", () => ({
  getWeeklyReportList: mocks.reportList,
  getWeeklyReport: mocks.report,
}));

import { DEFAULT_GUILD_SHARING } from "@/lib/guild/sharing";
import { AppError } from "@/server/errors/app-error";
import {
  getGuildMemberCalendarProjection,
  getGuildMemberProfileProjection,
  getGuildMemberReportListProjection,
  getGuildMemberReportProjection,
} from "@/server/services/guild-projection-service";

const viewer = "64b000000000000000000001";
const member = "64b000000000000000000002";
const now = new Date("2026-10-02T12:00:00.000Z");
const privateSharing = {
  ...DEFAULT_GUILD_SHARING,
  shareProfileSummary: false,
  shareProgression: false,
  shareWorkoutSummary: false,
};

const minimalReport = {
  status: "FINAL",
  generatedAt: now.toISOString(),
  period: {
    challengeWeek: 1,
    weekStartDate: "2026-10-01",
    weekEndDate: "2026-10-07",
  },
  dailyQuest: {
    elapsedDays: 0,
    recordedDays: 0,
    missedDays: 0,
    partialDays: 0,
    perfectDays: 0,
    dailyDisciplinePercent: null,
    perfectDayRate: null,
    allAvailableDaysCleared: false,
    perfectWeek: false,
  },
  rules: [],
  strongestRules: [],
  attentionRules: [],
  workout: {},
  progression: {},
  weight: null,
  bodyComposition: [],
  dailyBreakdown: [],
  arcScore: { value: 0, policyVersion: 1, isProvisional: false },
  systemEvaluation: { label: "INITIALIZING" },
};

describe("V2.5 Guild avatar privacy", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.connect.mockResolvedValue({});
    mocks.requireActive.mockResolvedValue({ status: "ACTIVE" });
    mocks.memberIds.mockResolvedValue([member]);
    mocks.owner.mockResolvedValue({
      _id: { toString: () => member },
      displayName: "Member",
      isActive: true,
      status: "ACTIVE",
    });
    mocks.profile.mockResolvedValue({
      displayName: "Member",
      avatarKey: "VOID_COMMANDER",
      selectedTitle: "DISCIPLINED",
      timezone: "UTC",
    });
    mocks.config.mockResolvedValue(null);
    mocks.progression.mockResolvedValue(null);
    mocks.streaks.mockResolvedValue(null);
    mocks.reportList.mockResolvedValue({
      kind: "AVAILABLE",
      current: null,
      finalized: [],
    });
    mocks.report.mockResolvedValue({ kind: "AVAILABLE", report: minimalReport });
    mocks.calendar.mockResolvedValue({
      kind: "AVAILABLE",
      month: "2026-10",
      currentDate: "2026-10-02",
      leadingMondaySlots: 3,
      challenge: null,
      days: [],
    });
  });

  it("returns the selected key only when profile summary sharing is enabled", async () => {
    mocks.sharing.mockResolvedValue({
      ...privateSharing,
      shareProfileSummary: true,
    });
    await expect(
      getGuildMemberProfileProjection(viewer, member, now),
    ).resolves.toMatchObject({
      identity: { avatarKey: "VOID_COMMANDER", selectedTitle: "DISCIPLINED" },
    });

    mocks.sharing.mockResolvedValue(privateSharing);
    await expect(
      getGuildMemberProfileProjection(viewer, member, now),
    ).resolves.toMatchObject({
      identity: { avatarKey: null, selectedTitle: null },
      summary: null,
    });
  });

  it("suppresses the selected key in calendar and both report projections", async () => {
    mocks.sharing.mockResolvedValue(privateSharing);
    const [calendar, reports, detail] = await Promise.all([
      getGuildMemberCalendarProjection(viewer, member, "2026-10", now),
      getGuildMemberReportListProjection(viewer, member, now),
      getGuildMemberReportProjection(viewer, member, 1, now),
    ]);
    expect(calendar).toMatchObject({ member: { avatarKey: null } });
    expect(reports).toMatchObject({ member: { avatarKey: null } });
    expect(detail).toMatchObject({ member: { avatarKey: null } });
    expect(JSON.stringify([calendar, reports, detail])).not.toContain("VOID_COMMANDER");
  });

  it.each([
    ["profile", () => getGuildMemberProfileProjection(viewer, member, now)],
    ["calendar", () => getGuildMemberCalendarProjection(viewer, member, "2026-10", now)],
    ["report list", () => getGuildMemberReportListProjection(viewer, member, now)],
    ["report detail", () => getGuildMemberReportProjection(viewer, member, 1, now)],
  ])(
    "blocks %s, including its avatar, after removal or blocking",
    async (_name, read) => {
      for (const code of ["GUILD_ACCESS_DENIED", "GUILD_BLOCKED"] as const) {
        mocks.requireActive.mockRejectedValueOnce(new AppError(code));
        await expect(read()).rejects.toMatchObject({ code });
      }
    },
  );
});
