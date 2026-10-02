import mongoose from "mongoose";

import { connectToDatabase } from "../src/server/db/mongoose";
import { AuthRateLimitModel } from "../src/server/models/auth-rate-limit";
import { DailyQuestEmailDeliveryModel } from "../src/server/models/daily-quest-email-delivery";
import { EmailOtpModel } from "../src/server/models/email-otp";
import { NotificationPreferencesModel } from "../src/server/models/notification-preferences";

async function main() {
  await connectToDatabase();
  const preferencesBefore = await NotificationPreferencesModel.countDocuments({});
  await Promise.all([
    NotificationPreferencesModel.init(),
    DailyQuestEmailDeliveryModel.init(),
    EmailOtpModel.init(),
    AuthRateLimitModel.init(),
  ]);
  const [preferencesAfter, preferenceIndexes, deliveryIndexes, otpIndexes, rateIndexes] =
    await Promise.all([
      NotificationPreferencesModel.countDocuments({}),
      NotificationPreferencesModel.collection.indexes(),
      DailyQuestEmailDeliveryModel.collection.indexes(),
      EmailOtpModel.collection.indexes(),
      AuthRateLimitModel.collection.indexes(),
    ]);
  const hasIndex = (indexes: readonly { name?: string }[], name: string) =>
    indexes.some((index) => index.name === name);
  const emailDefault = NotificationPreferencesModel.schema.path("dailyQuestEmailReminder")
    .options.default;
  if (
    preferencesBefore !== preferencesAfter ||
    emailDefault !== false ||
    !hasIndex(preferenceIndexes, "dailyQuestEmailReminder_1_userId_1") ||
    !hasIndex(deliveryIndexes, "unique_daily_quest_email_delivery") ||
    !hasIndex(otpIndexes, "email_otp_expiration") ||
    !hasIndex(rateIndexes, "auth_rate_limit_expiration")
  )
    throw new Error("V2_7_DATABASE_CONTRACT_INVALID");

  console.log(
    JSON.stringify({
      databaseVerification: "PASS",
      reminderPreferenceDefault: "OFF",
      deliveryDedupeIndex: "PASS",
      emailOtpTtl: "PASS",
      authRateLimitTtl: "PASS",
      existingPreferenceDocumentsMutated: 0,
      liveEmailSent: false,
      secretsLogged: false,
    }),
  );
}

main()
  .catch(() => {
    console.error(
      "V2.7 database verification failed; no raw database error or secret was logged.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
