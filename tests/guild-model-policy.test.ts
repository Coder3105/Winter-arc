import { describe, expect, it } from "vitest";

import { maskEmail } from "@/lib/auth/email";
import { DEFAULT_GUILD_SHARING } from "@/lib/guild/sharing";
import { GuildConnectionModel } from "@/server/models/guild-connection";
import { GuildInviteModel } from "@/server/models/guild-invite";
import { GuildSharingPreferencesModel } from "@/server/models/guild-sharing-preferences";
import { createGuildPairKey } from "@/server/services/guild-connection-service";

describe("V2.4 Guild persistence and policy", () => {
  it("uses the documented privacy-preserving defaults", () => {
    expect(DEFAULT_GUILD_SHARING).toEqual({
      shareProfileSummary: true,
      shareCalendar: true,
      shareWeeklyReports: true,
      shareProgression: true,
      shareWorkoutSummary: true,
      shareWeight: false,
      shareBodyComposition: false,
      sharePrivateHabits: false,
    });
  });

  it("enforces one pending invite and one canonical connection pair", () => {
    expect(GuildInviteModel.schema.indexes()).toContainEqual([
      { inviterUserId: 1, inviteeEmailNormalized: 1 },
      expect.objectContaining({
        unique: true,
        name: "unique_pending_guild_invite_target",
        partialFilterExpression: { status: "PENDING" },
      }),
    ]);
    expect(GuildConnectionModel.schema.indexes()).toContainEqual([
      { pairKey: 1 },
      expect.objectContaining({ unique: true, name: "unique_guild_pair" }),
    ]);
    expect(GuildSharingPreferencesModel.schema.indexes()).toContainEqual([
      { userId: 1 },
      expect.objectContaining({
        unique: true,
        name: "unique_guild_sharing_owner",
      }),
    ]);
  });

  it("builds the same pair identity in either direction and rejects self-pairs", () => {
    expect(createGuildPairKey("b", "a")).toBe("a:b");
    expect(createGuildPairKey("a", "b")).toBe("a:b");
    expect(() => createGuildPairKey("a", "a")).toThrow("own email");
  });

  it("masks email for outgoing presentation", () => {
    expect(maskEmail(" Nivedan@Example.com ")).toBe("n***@example.com");
  });
});
