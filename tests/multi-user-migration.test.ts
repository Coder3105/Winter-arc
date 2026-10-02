import { describe, expect, it } from "vitest";
import { normalizeEmail } from "@/lib/auth/email";
import {
  planAccountMigration,
  AccountMigrationConflict,
} from "@/server/migrations/multi-user-plan";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { OwnerModel, UserModel } from "@/server/models/owner";

const original = {
  _id: "original-stable-id",
  email: " Original@Example.test ",
  isActive: true,
};
describe("V2.1 non-destructive account migration", () => {
  it.each(["User@Test.com", "user@test.com", " user@test.com "])(
    "canonicalizes %s",
    (value) => {
      expect(normalizeEmail(value)).toBe("user@test.com");
    },
  );
  it("preserves original identity, links, password and inputs; a second run is empty", async () => {
    const passwordHash = await hashPassword("synthetic-legacy-password");
    const account = { ...original, passwordHash };
    const profile = { userId: account._id, selectedTitle: "RISING" };
    const config = { userId: account._id, startDate: "2026-10-01" };
    const before = structuredClone({ account, profile, config });
    const plan = planAccountMigration([account], "original@example.test");
    expect(plan).toEqual([
      {
        id: account._id,
        set: {
          emailNormalized: "original@example.test",
          status: "ACTIVE",
          emailVerifiedAt: null,
          isOriginalOwner: true,
        },
      },
    ]);
    const migrated = { ...account, ...plan[0]!.set };
    expect(planAccountMigration([migrated], "original@example.test")).toEqual([]);
    expect({ account, profile, config }).toEqual(before);
    expect(migrated._id).toBe(profile.userId);
    expect(migrated._id).toBe(config.userId);
    expect(await verifyPassword("synthetic-legacy-password", migrated.passwordHash)).toBe(
      true,
    );
  });
  it("never reactivates an inactive legacy account or changes verified metadata", () => {
    const other = { _id: "b", email: "b@example.test", isActive: false };
    expect(planAccountMigration([original, other], original.email)[1]?.set).toMatchObject(
      { status: "DISABLED", isOriginalOwner: false },
    );
    const migrated = {
      ...original,
      emailNormalized: "original@example.test",
      status: "ACTIVE",
      emailVerifiedAt: new Date("2026-01-01"),
      isOriginalOwner: true,
    };
    expect(planAccountMigration([migrated], original.email)).toEqual([]);
  });
  it("stops before writes for duplicate normalized identities", () => {
    const accounts = [
      original,
      { _id: "a", email: " USER@example.test ", isActive: true },
      { _id: "b", email: "user@example.test", isActive: true },
    ];
    expect(() => planAccountMigration(accounts, original.email)).toThrow(
      "EMAIL_CONFLICT",
    );
    expect(accounts[1]).not.toHaveProperty("emailNormalized");
  });
  it.each([
    [{ ...original, emailNormalized: "different@example.test" }],
    [{ ...original, status: "UNKNOWN" }],
    [{ ...original, isOriginalOwner: false }],
    [{ ...original, email: "not-an-email" }],
  ])("rejects ambiguous or corrupt metadata without disclosing identities", (account) => {
    expect(() => planAccountMigration([account], original.email)).toThrow(
      AccountMigrationConflict,
    );
  });
  it("keeps a single physical account model and explicitly managed indexes", () => {
    expect(UserModel).toBe(OwnerModel);
    expect(UserModel.collection.name).toBe("owners");
    expect(UserModel.schema.options.autoIndex).toBe(false);
    expect(UserModel.schema.indexes()).toContainEqual([
      { emailNormalized: 1 },
      expect.objectContaining({ unique: true, name: "unique_user_email_normalized" }),
    ]);
  });
});
