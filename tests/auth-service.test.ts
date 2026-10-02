import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  ownerFindOne: vi.fn(),
  ownerExists: vi.fn(),
  sessionCreate: vi.fn(),
  sessionFindOne: vi.fn(),
  sessionUpdateOne: vi.fn(),
}));

vi.mock("@/server/db/mongoose", () => ({
  connectToDatabase: mocks.connectToDatabase,
}));
vi.mock("@/server/models/owner", () => ({
  OwnerModel: { findOne: mocks.ownerFindOne, exists: mocks.ownerExists },
}));
vi.mock("@/server/models/auth-session", () => ({
  AuthSessionModel: {
    create: mocks.sessionCreate,
    findOne: mocks.sessionFindOne,
    updateOne: mocks.sessionUpdateOne,
  },
}));

import {
  authenticateOwner,
  createSession,
  revokeSession,
  validateSessionToken,
} from "@/server/auth/auth-service";
import { hashPassword } from "@/server/auth/password";
import { hashSessionToken } from "@/server/auth/session-token";

describe("authentication service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectToDatabase.mockResolvedValue({});
    mocks.ownerExists.mockResolvedValue({ _id: "owner-id" });
  });

  it("authenticates the owner without exposing passwordHash", async () => {
    const save = vi.fn();
    const owner = {
      _id: { toString: () => "owner-id" },
      email: "owner@example.com",
      displayName: "Nivedan",
      passwordHash: await hashPassword("correct-owner-password"),
      emailVerifiedAt: null,
      lastLoginAt: null,
      save,
    };
    mocks.ownerFindOne.mockReturnValue({ select: vi.fn().mockResolvedValue(owner) });

    const result = await authenticateOwner("OWNER@example.com", "correct-owner-password");

    expect(result).toEqual({
      id: "owner-id",
      email: "owner@example.com",
      displayName: "Nivedan",
    });
    expect(result).not.toHaveProperty("passwordHash");
    expect(owner.emailVerifiedAt).toBeNull();
    expect(save).toHaveBeenCalledOnce();
  });

  it("uses the same null result for unknown email and wrong password", async () => {
    mocks.ownerFindOne.mockReturnValueOnce({ select: vi.fn().mockResolvedValue(null) });
    await expect(
      authenticateOwner("missing@example.com", "wrong-password"),
    ).resolves.toBeNull();

    const owner = {
      passwordHash: await hashPassword("correct-owner-password"),
    };
    mocks.ownerFindOne.mockReturnValueOnce({ select: vi.fn().mockResolvedValue(owner) });
    await expect(
      authenticateOwner("owner@example.com", "wrong-password"),
    ).resolves.toBeNull();
  }, 10_000);

  it("stores only a hash when creating a session", async () => {
    mocks.sessionCreate.mockResolvedValue({});
    const result = await createSession("owner-id", "test-agent");
    const persisted = mocks.sessionCreate.mock.calls[0]?.[0];

    expect(persisted.tokenHash).toBe(hashSessionToken(result.token));
    expect(persisted.tokenHash).not.toBe(result.token);
    expect(persisted).not.toHaveProperty("token");
  });

  it("validates an active session and returns a safe owner", async () => {
    const sessionSave = vi.fn();
    mocks.sessionFindOne.mockResolvedValue({
      userId: "owner-id",
      lastUsedAt: new Date(0),
      save: sessionSave,
    });
    mocks.ownerFindOne.mockResolvedValue({
      _id: { toString: () => "owner-id" },
      email: "owner@example.com",
      displayName: "Nivedan",
    });

    const result = await validateSessionToken("a".repeat(43));
    expect(result).toEqual({
      id: "owner-id",
      email: "owner@example.com",
      displayName: "Nivedan",
    });
    expect(result).not.toHaveProperty("tokenHash");
    expect(sessionSave).toHaveBeenCalledOnce();
  });

  it("revokes only the matching hashed session", async () => {
    mocks.sessionUpdateOne.mockResolvedValue({ modifiedCount: 1 });
    await revokeSession("raw-session-token");
    expect(mocks.sessionUpdateOne).toHaveBeenCalledWith(
      { tokenHash: hashSessionToken("raw-session-token"), revokedAt: null },
      { $set: { revokedAt: expect.any(Date) } },
    );
  });
});
