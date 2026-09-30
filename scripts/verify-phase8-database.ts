import mongoose, { Types } from "mongoose";

import { connectToDatabase } from "@/server/db/mongoose";
import { ProgressionEventModel } from "@/server/models/progression-event";

function containsIndex(value: unknown, name: string): boolean {
  if (Array.isArray(value)) return value.some((item) => containsIndex(item, name));
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.indexName === name ||
    Object.values(record).some((item) => containsIndex(item, name))
  );
}

try {
  await connectToDatabase();
  await ProgressionEventModel.init();
  const indexes = await ProgressionEventModel.collection.indexes();
  const name = "unique_progression_source";
  const compound = indexes.find((index) => index.name === name);
  if (
    !compound?.unique ||
    JSON.stringify(compound.key) !==
      JSON.stringify({
        userId: 1,
        winterArcConfigId: 1,
        sourceType: 1,
        sourceKey: 1,
      })
  )
    throw new Error("Progression unique source index verification failed.");

  const plan = await ProgressionEventModel.find({
    userId: new Types.ObjectId("000000000000000000000001"),
    winterArcConfigId: new Types.ObjectId("000000000000000000000002"),
    sourceType: "DAILY_RULE",
    sourceKey: "daily-rule:2026-09-30:sleep",
  }).explain("executionStats");
  if (!containsIndex(plan, name))
    throw new Error("Progression identity query did not select the unique index.");

  console.log("PROGRESSION_COLLECTION=PASS");
  console.log("PROGRESSION_UNIQUE_IDENTITY_INDEX=PASS");
  console.log("PROGRESSION_IDENTITY_QUERY_INDEX=PASS");
  console.log(
    `PROGRESSION_EVENT_COUNT=${await ProgressionEventModel.countDocuments({})}`,
  );
} finally {
  await mongoose.disconnect();
}
