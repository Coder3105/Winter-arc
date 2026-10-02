import { beforeEach, describe, expect, it, vi } from "vitest";
import { matches } from "./helpers/memory-query";
const mock = vi.hoisted(() => ({
  findUser: vi.fn(),
  exists: vi.fn(),
  findSession: vi.fn(),
  createSession: vi.fn(),
  updateSession: vi.fn(),
}));
vi.mock("@/server/db/mongoose", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/server/models/owner", () => ({
  OwnerModel: { findOne: mock.findUser, exists: mock.exists },
}));
vi.mock("@/server/models/auth-session", () => ({
  AuthSessionModel: {
    findOne: mock.findSession,
    create: mock.createSession,
    updateOne: mock.updateSession,
  },
}));
import {
  authenticateUser,
  createSession,
  validateSessionToken,
  revokeSession,
} from "@/server/auth/auth-service";
import { hashSessionToken } from "@/server/auth/session-token";
import { hashPassword } from "@/server/auth/password";

describe("two independent authenticated users", () => {
  let users: Record<string, unknown>[];
  let sessions: Record<string, unknown>[];
  beforeEach(async () => {
    vi.clearAllMocks();
    users = ["a", "b"].map((id) => ({
      _id: id,
      email: id + "@example.test",
      emailNormalized: id + "@example.test",
      displayName: id,
      status: "ACTIVE",
      isActive: true,
      save: vi.fn(),
    }));
    sessions = ["a", "b"].map((id) => ({
      userId: id,
      tokenHash: hashSessionToken(id.repeat(43)),
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: null,
      lastUsedAt: new Date(),
      save: vi.fn(),
    }));
    mock.findUser.mockImplementation((filter) => {
      const result = users.find((user) => matches(user, filter)) ?? null;
      return Object.assign(Promise.resolve(result), {
        select: () => Promise.resolve(result),
      });
    });
    mock.exists.mockImplementation((filter) =>
      Promise.resolve(users.some((user) => matches(user, filter))),
    );
    mock.findSession.mockImplementation((filter) =>
      Promise.resolve(sessions.find((session) => matches(session, filter)) ?? null),
    );
    mock.updateSession.mockImplementation((filter, update) => {
      const session = sessions.find((session) => matches(session, filter));
      if (session) Object.assign(session, update.$set);
      return Promise.resolve({ modifiedCount: session ? 1 : 0 });
    });
    mock.createSession.mockImplementation((value) => {
      sessions.push(value);
      return Promise.resolve(value);
    });
  });
  it("resolves each session to its exact user and revokes only A", async () => {
    expect(await validateSessionToken("a".repeat(43))).toMatchObject({ id: "a" });
    expect(await validateSessionToken("b".repeat(43))).toMatchObject({ id: "b" });
    await revokeSession("a".repeat(43));
    expect(await validateSessionToken("a".repeat(43))).toBeNull();
    expect(await validateSessionToken("b".repeat(43))).toMatchObject({ id: "b" });
  });
  it.each(["DISABLED", "PENDING_VERIFICATION"])(
    "rejects %s passwords, existing sessions and session issuance",
    async (status) => {
      users[0]!.status = status;
      users[0]!.passwordHash = await hashPassword("synthetic-password");
      expect(await authenticateUser("a@example.test", "synthetic-password")).toBeNull();
      expect(await validateSessionToken("a".repeat(43))).toBeNull();
      await expect(createSession("a", null)).rejects.toThrow("not eligible");
      expect(mock.createSession).not.toHaveBeenCalled();
      expect(await validateSessionToken("b".repeat(43))).toMatchObject({ id: "b" });
    },
  );
  it("preserves legacy and migrated bcrypt login with canonical email", async () => {
    users[0]!.passwordHash = await hashPassword("synthetic-password");
    expect(
      await authenticateUser(" A@EXAMPLE.TEST ", "synthetic-password"),
    ).toMatchObject({ id: "a" });
    delete users[0]!.status;
    delete users[0]!.emailNormalized;
    expect(
      await authenticateUser(" A@EXAMPLE.TEST ", "synthetic-password"),
    ).toMatchObject({ id: "a" });
    const issued = await createSession("a", null);
    expect(await validateSessionToken(issued.token)).toMatchObject({ id: "a" });
    expect(sessions.at(-1)).not.toHaveProperty("token");
  }, 10_000);
  it("rejects malformed, expired, orphaned and revoked sessions", async () => {
    expect(await validateSessionToken("bad-token")).toBeNull();
    expect(mock.findSession).not.toHaveBeenCalled();
    sessions[0]!.expiresAt = new Date(0);
    expect(await validateSessionToken("a".repeat(43))).toBeNull();
    sessions[1]!.userId = "missing";
    expect(await validateSessionToken("b".repeat(43))).toBeNull();
  });
});
