import mongoose from "mongoose";

import { connectToDatabase } from "../src/server/db/mongoose";
import { AuthRateLimitModel } from "../src/server/models/auth-rate-limit";
import { EmailOtpModel } from "../src/server/models/email-otp";
import { OwnerModel } from "../src/server/models/owner";

function sameKey(actual: object, expected: object) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

async function main() {
  await connectToDatabase();
  const ownersBefore = await OwnerModel.countDocuments({});

  await Promise.all([EmailOtpModel.init(), AuthRateLimitModel.init()]);

  const [otpIndexes, rateIndexes, ownersAfter, otpDocuments, rateDocuments] =
    await Promise.all([
      EmailOtpModel.collection.indexes(),
      AuthRateLimitModel.collection.indexes(),
      OwnerModel.countDocuments({}),
      EmailOtpModel.countDocuments({}),
      AuthRateLimitModel.countDocuments({}),
    ]);

  const otpIdentity = otpIndexes.some(
    (index) =>
      index.unique === true &&
      sameKey(index.key, { emailNormalized: 1, purpose: 1, contextKey: 1 }),
  );
  const otpRequest = otpIndexes.some(
    (index) => index.unique === true && sameKey(index.key, { requestId: 1 }),
  );
  const otpTtl = otpIndexes.some(
    (index) => index.expireAfterSeconds === 0 && sameKey(index.key, { expiresAt: 1 }),
  );
  const rateIdentity = rateIndexes.some(
    (index) =>
      index.unique === true &&
      sameKey(index.key, { scope: 1, subjectHash: 1, windowStartedAt: 1 }),
  );
  const rateTtl = rateIndexes.some(
    (index) => index.expireAfterSeconds === 0 && sameKey(index.key, { expiresAt: 1 }),
  );

  if (
    ownersBefore !== ownersAfter ||
    !otpIdentity ||
    !otpRequest ||
    !otpTtl ||
    !rateIdentity ||
    !rateTtl
  ) {
    throw new Error("V2_2_DATABASE_CONTRACT_INVALID");
  }

  console.log(
    JSON.stringify({
      databaseVerification: "PASS",
      ownerAccountsCreated: 0,
      ownerCountUnchanged: true,
      emailOtpCollection: "PASS",
      emailOtpIndexesChecked: 3,
      authRateLimitCollection: "PASS",
      authRateLimitIndexesChecked: 2,
      currentOtpDocuments: otpDocuments,
      currentRateLimitDocuments: rateDocuments,
      secretsLogged: false,
    }),
  );
}

main()
  .catch(() => {
    console.error(
      "V2.2 database verification failed. Check Atlas access and OTP index definitions; no raw database error was logged.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
