import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyPassword } from "@/server/auth/password";
const mock = vi.hoisted(() => ({ create: vi.fn(), indexes: vi.fn() }));
vi.mock("@/server/db/mongoose", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/server/models/owner", () => ({
  OwnerModel: { create: mock.create, collection: { indexes: mock.indexes } },
}));
import {
  createUserAccount,
  createVerifiedUserAccount,
} from "@/server/services/user-account-service";
const input = {
  email: " User@Example.test ",
  password: "synthetic-password",
  displayName: "New user",
};
describe("internal blank account creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.indexes.mockResolvedValue([
      { name: "unique_user_email_normalized", key: { emailNormalized: 1 }, unique: true },
    ]);
    mock.create.mockImplementation((value) =>
      Promise.resolve({ _id: "new-id", ...value }),
    );
  });
  it("creates only account credentials and lifecycle metadata, with no personal defaults", async () => {
    expect(await createUserAccount(input)).toEqual({
      id: "new-id",
      email: "user@example.test",
      displayName: "New user",
      status: "PENDING_VERIFICATION",
    });
    const stored = mock.create.mock.calls[0]![0];
    expect(Object.keys(stored).sort()).toEqual(
      [
        "email",
        "emailNormalized",
        "passwordHash",
        "displayName",
        "status",
        "isActive",
        "emailVerifiedAt",
        "isOriginalOwner",
        "lastLoginAt",
      ].sort(),
    );
    expect(stored).toMatchObject({
      isActive: false,
      isOriginalOwner: false,
      emailVerifiedAt: null,
    });
    expect(await verifyPassword(input.password, stored.passwordHash)).toBe(true);
    expect(stored.passwordHash).not.toBe(input.password);
  });
  it("requires explicit activation and refuses extra personal or ownership fields", async () => {
    expect(await createUserAccount({ ...input, status: "ACTIVE" })).toMatchObject({
      status: "ACTIVE",
    });
    await expect(
      createUserAccount({ ...input, userId: "victim" } as typeof input),
    ).rejects.toThrow();
  });
  it("refuses creation without the exact non-sparse canonical uniqueness constraint", async () => {
    mock.indexes.mockResolvedValue([
      { name: "unique_user_email_normalized", key: { wrong: 1 }, unique: true },
    ]);
    await expect(createUserAccount(input)).rejects.toThrow("migration");
    expect(mock.create).not.toHaveBeenCalled();
  });
  it("sanitizes a duplicate normalized-email conflict", async () => {
    mock.create.mockRejectedValue({ code: 11000, message: "private duplicate identity" });
    await expect(createUserAccount(input)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("creates a verified active identity without copying any profile or protocol data", async () => {
    const emailVerifiedAt = new Date("2026-10-01T08:00:00.000Z");
    const account = await createVerifiedUserAccount({
      email: " NEW@Example.test ",
      password: "synthetic-password",
      emailVerifiedAt,
    });
    expect(account).toEqual({
      id: "new-id",
      email: "new@example.test",
      displayName: "Hunter",
    });
    const stored = mock.create.mock.calls[0]![0];
    expect(stored).toMatchObject({
      email: "new@example.test",
      emailNormalized: "new@example.test",
      displayName: "Hunter",
      status: "ACTIVE",
      isActive: true,
      isOriginalOwner: false,
      emailVerifiedAt,
      lastLoginAt: emailVerifiedAt,
    });
    expect(stored).not.toHaveProperty("heightCm");
    expect(stored).not.toHaveProperty("startingWeightKg");
    expect(stored).not.toHaveProperty("rules");
    expect(await verifyPassword("synthetic-password", stored.passwordHash)).toBe(true);
  });
});
