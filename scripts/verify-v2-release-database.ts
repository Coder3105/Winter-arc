import mongoose from "mongoose";

import { connectToDatabase } from "../src/server/db/mongoose";

interface IndexDescription {
  readonly name?: string;
}

async function main() {
  await connectToDatabase();
  const database = mongoose.connection.db;
  if (!database) throw new Error("DATABASE_NOT_CONNECTED");
  const connectedDatabase = database;

  const collections = await database.listCollections({}, { nameOnly: true }).toArray();
  const collectionNames = collections.map((collection) => collection.name);
  const owners = database.collection("owners");
  const configs = database.collection("winter_arc_configs");
  const [ownerIds, configIds, originalOwnerCount, fixtureResidue] = await Promise.all([
    owners.distinct("_id"),
    configs.distinct("_id"),
    owners.countDocuments({ isOriginalOwner: true }),
    owners.countDocuments({
      $or: [
        { emailNormalized: /^codex-v2-/i },
        { displayName: /^(Responsive Hunter|Guild Sentinel|Setup Hunter)$/ },
      ],
    }),
  ]);

  let orphanedOwnerReferences = 0;
  let orphanedConfigurationReferences = 0;
  const ownerReferenceFields = [
    "userId",
    "inviterUserId",
    "inviteeUserId",
    "userAId",
    "userBId",
    "blockedByUserId",
  ];
  for (const collectionName of collectionNames) {
    const collection = database.collection(collectionName);
    for (const field of ownerReferenceFields)
      orphanedOwnerReferences += await collection.countDocuments({
        [field]: { $exists: true, $ne: null, $nin: ownerIds },
      });
    orphanedConfigurationReferences += await collection.countDocuments({
      winterArcConfigId: { $exists: true, $ne: null, $nin: configIds },
    });
  }

  async function indexes(name: string) {
    if (!collectionNames.includes(name)) return [];
    return connectedDatabase.collection(name).indexes() as Promise<IndexDescription[]>;
  }
  const [ownerIndexes, otpIndexes, rateIndexes, deliveryIndexes] = await Promise.all([
    indexes("owners"),
    indexes("email_otps"),
    indexes("auth_rate_limits"),
    indexes("daily_quest_email_deliveries"),
  ]);
  const has = (values: readonly IndexDescription[], name: string) =>
    values.some((value) => value.name === name);

  if (
    originalOwnerCount !== 1 ||
    fixtureResidue !== 0 ||
    orphanedOwnerReferences !== 0 ||
    orphanedConfigurationReferences !== 0 ||
    !has(ownerIndexes, "unique_user_email_normalized") ||
    !has(otpIndexes, "email_otp_expiration") ||
    !has(rateIndexes, "auth_rate_limit_expiration") ||
    !has(deliveryIndexes, "unique_daily_quest_email_delivery")
  )
    throw new Error("V2_RELEASE_DATABASE_CONTRACT_INVALID");

  console.log(
    JSON.stringify({
      databaseVerification: "PASS",
      requiredIndexes: "PASS",
      ttlIndexes: "PASS",
      ownershipIntegrity: "PASS",
      orphanedRecords: 0,
      fixtureResidue: 0,
      originalOwnerPreserved: true,
      dataMutations: 0,
      secretsLogged: false,
    }),
  );
}

main()
  .catch(() => {
    console.error(
      "V2 release database verification failed; no database values or raw errors were logged.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
