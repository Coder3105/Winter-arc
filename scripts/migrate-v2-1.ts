import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { getServerEnvironment } from "../src/lib/env/server";
import {
  AccountMigrationConflict,
  planAccountMigration,
  type LegacyAccount,
} from "../src/server/migrations/multi-user-plan";

const accountFields = new Set([
  "emailNormalized",
  "status",
  "emailVerifiedAt",
  "isOriginalOwner",
]);
const apply = process.argv.includes("--apply");

async function main() {
  const env = getServerEnvironment();
  if (!process.env.OWNER_EMAIL) throw new Error("ORIGINAL_EMAIL_REQUIRED");
  // Raw driver access: importing models here could trigger unrelated index creation.
  await mongoose.connect(env.MONGODB_URI, {
    dbName: env.MONGODB_DB_NAME,
    autoIndex: false,
    autoCreate: false,
    serverSelectionTimeoutMS: 8000,
  });
  const db = mongoose.connection.db!;
  const accounts = db.collection("owners");
  const before = await accounts.find({}).toArray();
  const plan = planAccountMigration(
    before as unknown as LegacyAccount[],
    process.env.OWNER_EMAIL,
  );
  const indexes = before.length ? await accounts.indexes() : [];
  const normalizedIndex = indexes.find(
    (index) => index.name === "unique_user_email_normalized",
  );
  if (
    normalizedIndex &&
    (!normalizedIndex.unique ||
      normalizedIndex.sparse ||
      normalizedIndex.partialFilterExpression ||
      JSON.stringify(normalizedIndex.key) !== JSON.stringify({ emailNormalized: 1 }))
  )
    throw new Error("INDEX_CONFLICT");
  const originalIndex = indexes.find((index) => index.name === "unique_original_owner");
  if (
    originalIndex &&
    (!originalIndex.unique ||
      originalIndex.sparse ||
      JSON.stringify(originalIndex.key) !== JSON.stringify({ isOriginalOwner: 1 }) ||
      JSON.stringify(originalIndex.partialFilterExpression) !==
        JSON.stringify({ isOriginalOwner: true }))
  )
    throw new Error("INDEX_CONFLICT");
  console.log(
    JSON.stringify({
      mode: apply ? "APPLY" : "DRY_RUN",
      accounts: before.length,
      accountsNeedingMetadata: plan.length,
      emailConflicts: 0,
      normalizedUniqueIndex: Boolean(normalizedIndex),
    }),
  );

  // Compare all non-account documents and all untouched account fields in-memory.
  // No hashes, IDs, personal measurements, credentials or documents are logged.
  async function fingerprint() {
    const hash = createHash("sha256");
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    for (const { name } of collections.sort((a, b) => a.name.localeCompare(b.name))) {
      if (name.startsWith("system.")) continue;
      hash.update(name);
      for await (const doc of db.collection(name).find({}).sort({ _id: 1 })) {
        if (name === "owners") for (const key of accountFields) delete doc[key];
        hash.update(JSON.stringify(doc));
      }
    }
    return hash.digest("hex");
  }
  if (!apply) return;
  if (!before.length) throw new Error("NO_EXISTING_ACCOUNT_TO_MIGRATE");
  const initialFingerprint = await fingerprint();
  for (const change of plan) {
    const snapshot = before.find(
      (account) => account._id.toString() === change.id.toString(),
    )!;
    const result = await accounts.updateOne(
      {
        _id: snapshot._id,
        email: snapshot.email,
        isActive: snapshot.isActive,
        status: snapshot.status ?? { $exists: false },
        ...Object.fromEntries(
          Object.keys(change.set).map((key) => [key, { $exists: false }]),
        ),
      },
      { $set: change.set },
    );
    if (result.matchedCount !== 1)
      throw new Error("CONCURRENT_ACCOUNT_CHANGE_RERUN_PREFLIGHT");
  }
  await accounts.createIndex(
    { emailNormalized: 1 },
    { unique: true, name: "unique_user_email_normalized" },
  );
  await accounts.createIndex(
    { isOriginalOwner: 1 },
    {
      unique: true,
      partialFilterExpression: { isOriginalOwner: true },
      name: "unique_original_owner",
    },
  );
  const remaining = planAccountMigration(
    (await accounts.find({}).toArray()) as unknown as LegacyAccount[],
    process.env.OWNER_EMAIL,
  );
  if (remaining.length) throw new Error("MIGRATION_INCOMPLETE");
  if ((await fingerprint()) !== initialFingerprint)
    throw new Error("CONCURRENT_DATA_CHANGE_OR_PRESERVATION_CHECK_FAILED");
  console.log(
    JSON.stringify({
      migration: "PASS",
      accountIdsPreserved: true,
      passwordsAndPersonalDataUnchanged: true,
      idempotent: true,
      indexesVerified: true,
    }),
  );
}
main()
  .catch((error: unknown) => {
    // Never print raw Mongo errors (may include credentials or duplicate identities).
    console.error(
      error instanceof AccountMigrationConflict
        ? error.message
        : "V2.1 migration/verification blocked. Check connectivity, database permissions and preflight conditions; no raw database error was logged.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
