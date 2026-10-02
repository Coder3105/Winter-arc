import mongoose from "mongoose";

import { connectToDatabase } from "../src/server/db/mongoose";
import { EmailOtpModel } from "../src/server/models/email-otp";
import { GuildConnectionModel } from "../src/server/models/guild-connection";
import { GuildInviteModel } from "../src/server/models/guild-invite";
import { GuildSharingPreferencesModel } from "../src/server/models/guild-sharing-preferences";

async function main() {
  await connectToDatabase();
  const existingIndexes = await EmailOtpModel.collection.indexes();
  const legacy = existingIndexes.find(
    (index) =>
      index.name === "unique_email_otp_purpose" &&
      JSON.stringify(index.key) === JSON.stringify({ emailNormalized: 1, purpose: 1 }),
  );
  if (legacy?.name) await EmailOtpModel.collection.dropIndex(legacy.name);
  await EmailOtpModel.collection.createIndex(
    { emailNormalized: 1, purpose: 1, contextKey: 1 },
    { unique: true, name: "unique_email_otp_context" },
  );
  await Promise.all([
    GuildInviteModel.init(),
    GuildConnectionModel.init(),
    GuildSharingPreferencesModel.init(),
  ]);
  console.log(
    JSON.stringify({
      migration: "V2.4",
      status: "PASS",
      legacyOtpIdentityRemoved: Boolean(legacy),
      contextualOtpIdentity: "READY",
      guildIndexes: "READY",
      sourceDocumentsMutated: 0,
      secretsLogged: false,
    }),
  );
}

main()
  .catch(() => {
    console.error(
      "V2.4 migration failed. Check Atlas access and index permissions; no raw database error was logged.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
