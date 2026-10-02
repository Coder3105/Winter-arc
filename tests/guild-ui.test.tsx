import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GuildDashboard } from "@/components/guild/guild-dashboard";
import { ProfileGuildPreview } from "@/components/guild/profile-guild-preview";

describe("Guild invitation dashboard", () => {
  it("places OTP entry on outgoing requests and leaves incoming requests decline-only", () => {
    const html = renderToStaticMarkup(
      createElement(GuildDashboard, {
        initialInvites: {
          incoming: [
            {
              id: "64b000000000000000000011",
              status: "PENDING",
              inviter: { displayName: "Hunter A", avatarKey: null },
              createdAt: "2026-10-01T08:00:00.000Z",
              expiresAt: "2026-10-08T08:00:00.000Z",
            },
          ],
          outgoing: [
            {
              id: "64b000000000000000000012",
              status: "PENDING",
              targetEmailMasked: "f****d@example.test",
              verification: { requestId: "r".repeat(43) },
              createdAt: "2026-10-01T08:00:00.000Z",
              expiresAt: "2026-10-08T08:00:00.000Z",
            },
          ],
        },
        initialMembers: [],
      }),
    );

    expect(html).toContain("Hunter A");
    expect(html).toContain("DECLINE");
    expect(html).toContain("f****d@example.test");
    expect(html).toContain("ENTER CODE");
    expect(html).toContain('<time dateTime="2026-10-08T08:00:00.000Z">2026-10-08</time>');
    expect(html).not.toMatch(/10\/8\/2026|8\/10\/2026/);
    expect(html).not.toContain("VERIFY &amp; ACCEPT");
    expect(html).not.toContain(">ACCEPT<");
  });

  it("renders connected members in the Profile Guild preview", () => {
    const html = renderToStaticMarkup(
      createElement(ProfileGuildPreview, {
        members: [
          {
            userId: "member-1",
            displayName: "Guild Sentinel",
            avatarKey: "ICE_SENTINEL",
            selectedTitle: "DISCIPLINED",
            summary: null,
            progression: { rank: "D", level: 8, totalXp: 1_200 },
            access: {
              calendar: true,
              weeklyReports: false,
              progression: true,
              workoutSummary: false,
            },
          },
        ],
      }),
    );
    expect(html).toContain("Guild Sentinel");
    expect(html).toContain("DISCIPLINED");
    expect(html).toContain("RANK D // LEVEL 8");
    expect(html).toContain('href="/guild/member-1"');
    expect(html).not.toContain("NO MEMBERS CONNECTED");
  });
});
