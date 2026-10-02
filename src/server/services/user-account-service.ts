import "server-only";
import { z } from "zod";
import { normalizeEmail } from "@/lib/auth/email";
import { hashPassword } from "@/server/auth/password";
import { connectToDatabase } from "@/server/db/mongoose";
import { OwnerModel } from "@/server/models/owner";
import { AppError } from "@/server/errors/app-error";

const accountInput = z
  .object({
    email: z.string().trim().email().max(320).transform(normalizeEmail),
    password: z.string().min(12).max(256),
    displayName: z.string().trim().min(1).max(80),
    status: z.enum(["ACTIVE", "PENDING_VERIFICATION"]).default("PENDING_VERIFICATION"),
  })
  .strict();

const verifiedAccountInput = z
  .object({
    email: z.string().trim().email().max(320).transform(normalizeEmail),
    password: z.string().min(12).max(256),
    emailVerifiedAt: z.date(),
  })
  .strict();

async function assertAccountIndex() {
  const indexes = await OwnerModel.collection.indexes();
  if (
    !indexes.some(
      (index) =>
        index.name === "unique_user_email_normalized" &&
        index.unique &&
        !index.partialFilterExpression &&
        !index.sparse &&
        JSON.stringify(index.key) === JSON.stringify({ emailNormalized: 1 }),
    )
  ) {
    throw new Error("Run the V2.1 account migration before creating accounts.");
  }
}

/** Internal only. Does not create a profile, config, baseline, preferences or history. */
export async function createUserAccount(input: z.input<typeof accountInput>) {
  const data = accountInput.parse(input);
  await connectToDatabase();
  await assertAccountIndex();
  try {
    const user = await OwnerModel.create({
      email: data.email,
      emailNormalized: data.email,
      passwordHash: await hashPassword(data.password),
      displayName: data.displayName,
      status: data.status,
      isActive: data.status === "ACTIVE",
      emailVerifiedAt: null,
      isOriginalOwner: false,
      lastLoginAt: null,
    });
    return {
      id: user._id.toString(),
      email: user.email,
      displayName: user.displayName,
      status: user.status,
    };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    )
      throw new AppError("CONFLICT");
    throw error;
  }
}

/** Public registration finalization. Personal profile/configuration data stays absent. */
export async function createVerifiedUserAccount(
  input: z.input<typeof verifiedAccountInput>,
) {
  const data = verifiedAccountInput.parse(input);
  await connectToDatabase();
  await assertAccountIndex();
  try {
    const user = await OwnerModel.create({
      email: data.email,
      emailNormalized: data.email,
      passwordHash: await hashPassword(data.password),
      displayName: "Hunter",
      status: "ACTIVE",
      isActive: true,
      emailVerifiedAt: data.emailVerifiedAt,
      isOriginalOwner: false,
      lastLoginAt: data.emailVerifiedAt,
    });
    return {
      id: user._id.toString(),
      email: user.email,
      displayName: user.displayName,
    };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      throw new AppError("ACCOUNT_ALREADY_EXISTS");
    }
    throw error;
  }
}
