import { z } from "zod";
import { normalizeEmail } from "@/lib/auth/email";

export interface LegacyAccount {
  readonly _id: { toString(): string };
  readonly email: string;
  readonly emailNormalized?: string;
  readonly status?: string;
  readonly isActive: boolean;
  readonly emailVerifiedAt?: Date | null;
  readonly isOriginalOwner?: boolean;
}

export class AccountMigrationConflict extends Error {
  constructor(
    readonly reason:
      | "EMAIL_CONFLICT"
      | "INVALID_ACCOUNT"
      | "ORIGINAL_ACCOUNT_AMBIGUOUS"
      | "IDENTITY_MISMATCH",
  ) {
    super(`Account migration stopped: ${reason}. No conflicting data was deleted.`);
  }
}

/** Pure preflight: no writes, password access, verification guesses or personal data. */
export function planAccountMigration(
  accounts: readonly LegacyAccount[],
  originalEmail: string,
) {
  const original = normalizeEmail(originalEmail);
  const identities = new Set<string>();
  const originals = accounts.filter(
    (account) => normalizeEmail(account.email) === original,
  );
  if (accounts.length && originals.length !== 1)
    throw new AccountMigrationConflict("ORIGINAL_ACCOUNT_AMBIGUOUS");
  for (const account of accounts) {
    const normalized = normalizeEmail(account.email);
    if (
      (account.isOriginalOwner !== undefined &&
        typeof account.isOriginalOwner !== "boolean") ||
      (account.emailVerifiedAt !== undefined &&
        account.emailVerifiedAt !== null &&
        (!(account.emailVerifiedAt instanceof Date) ||
          !Number.isFinite(account.emailVerifiedAt.getTime())))
    ) {
      throw new AccountMigrationConflict("INVALID_ACCOUNT");
    }
    if (
      !z.string().email().max(320).safeParse(normalized).success ||
      typeof account.isActive !== "boolean" ||
      (account.status !== undefined &&
        !["ACTIVE", "PENDING_VERIFICATION", "DISABLED"].includes(account.status))
    ) {
      throw new AccountMigrationConflict("INVALID_ACCOUNT");
    }
    if (identities.has(normalized)) throw new AccountMigrationConflict("EMAIL_CONFLICT");
    identities.add(normalized);
    if (account.emailNormalized !== undefined && account.emailNormalized !== normalized)
      throw new AccountMigrationConflict("IDENTITY_MISMATCH");
    if (account.isOriginalOwner === true && normalized !== original)
      throw new AccountMigrationConflict("ORIGINAL_ACCOUNT_AMBIGUOUS");
    if (account.isOriginalOwner === false && normalized === original)
      throw new AccountMigrationConflict("ORIGINAL_ACCOUNT_AMBIGUOUS");
  }
  return accounts
    .map((account) => {
      const set: Record<string, string | boolean | null> = {};
      if (account.emailNormalized === undefined)
        set.emailNormalized = normalizeEmail(account.email);
      if (account.status === undefined)
        set.status = account.isActive ? "ACTIVE" : "DISABLED";
      if (account.emailVerifiedAt === undefined) set.emailVerifiedAt = null;
      if (account.isOriginalOwner === undefined)
        set.isOriginalOwner = normalizeEmail(account.email) === original;
      return { id: account._id, set };
    })
    .filter((change) => Object.keys(change.set).length > 0);
}
