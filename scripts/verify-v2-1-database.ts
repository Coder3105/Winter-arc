import mongoose from "mongoose";
import { getServerEnvironment } from "../src/lib/env/server";
import { normalizeEmail } from "../src/lib/auth/email";

const personalCollections = [
  "auth_sessions",
  "user_profiles",
  "winter_arc_configs",
  "body_composition_assessments",
  "daily_quest_records",
  "workout_records",
  "weight_records",
  "progression_events",
  "achievement_unlocks",
  "reward_grants",
  "recovery_protocols",
  "weekly_reports",
  "notification_preferences",
  "notification_records",
  "push_subscription_records",
] as const;

const uniqueIdentities = {
  user_profiles: { userId: 1 },
  body_composition_assessments: {
    userId: 1,
    winterArcConfigId: 1,
    isBaseline: 1,
  },
  daily_quest_records: { userId: 1, winterArcConfigId: 1, date: 1 },
  weight_records: { userId: 1, winterArcConfigId: 1, date: 1 },
  progression_events: {
    userId: 1,
    winterArcConfigId: 1,
    sourceType: 1,
    sourceKey: 1,
  },
  achievement_unlocks: {
    userId: 1,
    winterArcConfigId: 1,
    achievementKey: 1,
    achievementVersion: 1,
  },
  reward_grants: {
    userId: 1,
    winterArcConfigId: 1,
    rewardType: 1,
    rewardKey: 1,
  },
  recovery_protocols: { userId: 1, winterArcConfigId: 1, type: 1, sourceKey: 1 },
  weekly_reports: {
    userId: 1,
    winterArcConfigId: 1,
    challengeWeek: 1,
    reportPolicyVersion: 1,
  },
  notification_preferences: { userId: 1 },
  notification_records: {
    userId: 1,
    winterArcConfigId: 1,
    dedupeKey: 1,
    policyVersion: 1,
  },
  push_subscription_records: { endpointHash: 1 },
} as const;

function sameKey(actual: object, expected: object) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

async function main() {
  const environment = getServerEnvironment();
  const originalEmail = process.env.OWNER_EMAIL;
  if (!originalEmail) throw new Error("ORIGINAL_EMAIL_REQUIRED");
  await mongoose.connect(environment.MONGODB_URI, {
    dbName: environment.MONGODB_DB_NAME,
    autoIndex: false,
    autoCreate: false,
    serverSelectionTimeoutMS: 8_000,
  });
  const db = mongoose.connection.db!;
  const accounts = await db
    .collection("owners")
    .find(
      {},
      {
        projection: {
          _id: 1,
          email: 1,
          emailNormalized: 1,
          status: 1,
          isActive: 1,
          isOriginalOwner: 1,
          emailVerifiedAt: 1,
          passwordHash: 1,
        },
      },
    )
    .toArray();
  if (accounts.length === 0) throw new Error("ACCOUNT_FOUNDATION_INVALID");
  const normalized = accounts.map((account) => account.emailNormalized);
  if (
    new Set(normalized).size !== normalized.length ||
    accounts.some(
      (account) =>
        account.emailNormalized !== normalizeEmail(account.email) ||
        !["ACTIVE", "PENDING_VERIFICATION", "DISABLED"].includes(account.status) ||
        account.isActive !== (account.status === "ACTIVE") ||
        !/^\$2[aby]\$12\$/.test(account.passwordHash),
    )
  ) {
    throw new Error("ACCOUNT_FOUNDATION_INVALID");
  }
  const original = accounts.filter(
    (account) =>
      account.isOriginalOwner === true &&
      account.emailNormalized === normalizeEmail(originalEmail),
  );
  if (original.length !== 1 || original[0]!.status !== "ACTIVE")
    throw new Error("ORIGINAL_ACCOUNT_INVALID");

  const accountIndexes = await db.collection("owners").indexes();
  if (
    !accountIndexes.some(
      (index) =>
        index.unique === true &&
        sameKey(index.key, { emailNormalized: 1 }) &&
        !index.partialFilterExpression &&
        !index.sparse,
    )
  ) {
    throw new Error("CANONICAL_EMAIL_INDEX_INVALID");
  }

  const existing = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name),
  );
  const accountIds = accounts.map((account) => account._id);
  let checkedDocuments = 0;
  let checkedIndexes = 0;
  for (const collectionName of personalCollections) {
    if (!existing.has(collectionName)) continue;
    const collection = db.collection(collectionName);
    checkedDocuments += await collection.countDocuments({});
    if (
      (await collection.countDocuments({
        $or: [{ userId: { $exists: false } }, { userId: { $nin: accountIds } }],
      })) !== 0
    ) {
      throw new Error("ORPHANED_PERSONAL_DOCUMENT");
    }
    const expected = uniqueIdentities[collectionName as keyof typeof uniqueIdentities];
    if (expected) {
      const indexes = await collection.indexes();
      if (
        !indexes.some((index) => index.unique === true && sameKey(index.key, expected))
      ) {
        throw new Error("PERSONAL_UNIQUE_INDEX_INVALID");
      }
      checkedIndexes += 1;
    }
  }
  console.log(
    JSON.stringify({
      databaseVerification: "PASS",
      accounts: accounts.length,
      originalAccount: "PRESERVED",
      personalCollectionsChecked: personalCollections.filter((name) => existing.has(name))
        .length,
      personalDocumentsChecked: checkedDocuments,
      userScopedUniqueIndexesChecked: checkedIndexes,
      orphanedDocuments: 0,
      secretsLogged: false,
    }),
  );
}

main()
  .catch(() => {
    console.error(
      "V2.1 database verification failed. Check account metadata, ownership, indexes and access; no raw database error was logged.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
