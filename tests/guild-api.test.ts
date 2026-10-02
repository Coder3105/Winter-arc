import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getApiOwner: vi.fn(),
  listInvites: vi.fn(),
  sendInvite: vi.fn(),
  resendInvite: vi.fn(),
  acceptInvite: vi.fn(),
  declineInvite: vi.fn(),
  cancelInvite: vi.fn(),
  listMembers: vi.fn(),
  profile: vi.fn(),
  calendar: vi.fn(),
  reportList: vi.fn(),
  report: vi.fn(),
  removeMember: vi.fn(),
  blockMember: vi.fn(),
  getSharing: vi.fn(),
  updateSharing: vi.fn(),
}));

vi.mock("@/server/auth/api-auth", () => ({ getApiOwner: mocks.getApiOwner }));
vi.mock("@/server/services/guild-invite-service", () => ({
  listGuildInvites: mocks.listInvites,
  sendGuildInvite: mocks.sendInvite,
  resendGuildInviteOtp: mocks.resendInvite,
  acceptGuildInvite: mocks.acceptInvite,
  declineGuildInvite: mocks.declineInvite,
  cancelGuildInvite: mocks.cancelInvite,
}));
vi.mock("@/server/services/guild-projection-service", () => ({
  getGuildMemberListProjection: mocks.listMembers,
  getGuildMemberProfileProjection: mocks.profile,
  getGuildMemberCalendarProjection: mocks.calendar,
  getGuildMemberReportListProjection: mocks.reportList,
  getGuildMemberReportProjection: mocks.report,
}));
vi.mock("@/server/services/guild-connection-service", () => ({
  removeGuildMember: mocks.removeMember,
  blockGuildMember: mocks.blockMember,
}));
vi.mock("@/server/services/guild-sharing-service", () => ({
  getGuildSharingPreferences: mocks.getSharing,
  updateGuildSharingPreferences: mocks.updateSharing,
}));

import { GET as getInvites, POST as postInvite } from "@/app/api/v1/guild/invites/route";
import { POST as acceptInvite } from "@/app/api/v1/guild/invites/[inviteId]/accept/route";
import { GET as getMembers } from "@/app/api/v1/guild/members/route";
import { DELETE as deleteMember } from "@/app/api/v1/guild/members/[memberId]/route";
import { GET as getMemberProfile } from "@/app/api/v1/guild/members/[memberId]/profile/route";
import { GET as getMemberCalendar } from "@/app/api/v1/guild/members/[memberId]/calendar/route";
import { GET as getMemberReports } from "@/app/api/v1/guild/members/[memberId]/reports/route";
import { GET as getSharing, PUT as putSharing } from "@/app/api/v1/guild/sharing/route";
import { DEFAULT_GUILD_SHARING } from "@/lib/guild/sharing";

const user = {
  id: "64b000000000000000000001",
  email: "owner@example.test",
  displayName: "Owner",
};
const inviteId = "64b000000000000000000002";
const memberId = "64b000000000000000000003";

function jsonRequest(path: string, body: unknown, method = "POST") {
  return new Request(`http://local${path}`, {
    method,
    headers: {
      origin: "http://local",
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.20",
    },
    body: JSON.stringify(body),
  });
}

describe("V2.4 Guild APIs", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getApiOwner.mockResolvedValue(user);
    mocks.listInvites.mockResolvedValue({ incoming: [], outgoing: [] });
    mocks.listMembers.mockResolvedValue([]);
    mocks.getSharing.mockResolvedValue({ ...DEFAULT_GUILD_SHARING });
  });

  it("requires the authenticated session across friend reads", async () => {
    mocks.getApiOwner.mockResolvedValue(null);
    const responses = await Promise.all([
      getInvites(),
      getMembers(),
      getMemberProfile(new Request("http://local"), {
        params: Promise.resolve({ memberId }),
      }),
      getMemberCalendar(
        new NextRequest(
          `http://local/api/v1/guild/members/${memberId}/calendar?month=2026-10`,
        ),
        { params: Promise.resolve({ memberId }) },
      ),
      getMemberReports(new Request("http://local"), {
        params: Promise.resolve({ memberId }),
      }),
      getSharing(),
    ]);
    expect(responses.every((response) => response.status === 401)).toBe(true);
    expect(mocks.profile).not.toHaveBeenCalled();
    expect(mocks.calendar).not.toHaveBeenCalled();
    expect(mocks.reportList).not.toHaveBeenCalled();
  });

  it("normalizes an invitation without accepting browser ownership fields", async () => {
    mocks.sendInvite.mockResolvedValue({
      message: "GUILD INVITATION SENT",
      expiresAt: "2026-10-08T00:00:00.000Z",
    });
    const response = await postInvite(
      jsonRequest("/api/v1/guild/invites", { email: " Friend@Example.test " }),
    );
    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.sendInvite).toHaveBeenCalledWith(
      user,
      "friend@example.test",
      "203.0.113.20",
    );

    const forged = await postInvite(
      jsonRequest("/api/v1/guild/invites", {
        email: "friend@example.test",
        userId: memberId,
      }),
    );
    expect(forged.status).toBe(400);
  });

  it("uses the session user for OTP acceptance and rejects malformed IDs", async () => {
    mocks.acceptInvite.mockResolvedValue({ memberId, status: "ACTIVE" });
    const response = await acceptInvite(
      jsonRequest(`/api/v1/guild/invites/${inviteId}/accept`, {
        requestId: "r".repeat(43),
        otp: "012345",
      }),
      { params: Promise.resolve({ inviteId }) },
    );
    expect(response.status).toBe(200);
    expect(mocks.acceptInvite).toHaveBeenCalledWith(
      user,
      inviteId,
      { requestId: "r".repeat(43), otp: "012345" },
      "203.0.113.20",
    );

    const malformed = await acceptInvite(
      jsonRequest("/api/v1/guild/invites/not-an-id/accept", {
        requestId: "r".repeat(43),
        otp: "012345",
      }),
      { params: Promise.resolve({ inviteId: "not-an-id" }) },
    );
    expect(malformed.status).toBe(400);
  });

  it("passes requester and viewed member separately for IDOR enforcement", async () => {
    mocks.profile.mockResolvedValue({ identity: { userId: memberId } });
    const profile = await getMemberProfile(new Request("http://local"), {
      params: Promise.resolve({ memberId }),
    });
    expect(profile.status).toBe(200);
    expect(mocks.profile).toHaveBeenCalledExactlyOnceWith(user.id, memberId);

    mocks.calendar.mockResolvedValue({ kind: "UNAVAILABLE", reason: "PROFILE_REQUIRED" });
    const calendar = await getMemberCalendar(
      new NextRequest(
        `http://local/api/v1/guild/members/${memberId}/calendar?month=2026-10`,
      ),
      { params: Promise.resolve({ memberId }) },
    );
    expect(calendar.status).toBe(200);
    expect(mocks.calendar).toHaveBeenCalledExactlyOnceWith(user.id, memberId, "2026-10");
    expect(calendar.headers.get("cache-control")).toBe("private, no-store");
  });

  it("removes only an active member of the current session user", async () => {
    mocks.removeMember.mockResolvedValue({ memberId, status: "REMOVED" });
    const response = await deleteMember(
      new Request(`http://local/api/v1/guild/members/${memberId}`, {
        method: "DELETE",
        headers: { origin: "http://local" },
      }),
      { params: Promise.resolve({ memberId }) },
    );
    expect(response.status).toBe(200);
    expect(mocks.removeMember).toHaveBeenCalledExactlyOnceWith(user.id, memberId);
  });

  it("updates only the authenticated owner's complete sharing policy", async () => {
    const updated = { ...DEFAULT_GUILD_SHARING, shareCalendar: false };
    mocks.updateSharing.mockResolvedValue(updated);
    const response = await putSharing(
      jsonRequest("/api/v1/guild/sharing", updated, "PUT"),
    );
    expect(response.status).toBe(200);
    expect(mocks.updateSharing).toHaveBeenCalledExactlyOnceWith(user.id, updated);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
