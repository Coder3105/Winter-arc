import mongoose, { Types } from "mongoose";

import { connectToDatabase } from "@/server/db/mongoose";
import { DailyQuestRecordModel } from "@/server/models/daily-quest-record";

function containsIndexName(value: unknown, name: string): boolean {
  if (Array.isArray(value)) return value.some((item) => containsIndexName(item, name));
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.indexName === name ||
    Object.values(record).some((item) => containsIndexName(item, name))
  );
}

try {
  await connectToDatabase();
  await DailyQuestRecordModel.init();
  const indexes = await DailyQuestRecordModel.collection.indexes();
  const name = "unique_daily_quest_per_protocol";
  const compound = indexes.find((index) => index.name === name);
  if (
    !compound?.unique ||
    JSON.stringify(compound.key) !==
      JSON.stringify({ userId: 1, winterArcConfigId: 1, date: 1 })
  ) {
    throw new Error("Daily Quest compound index verification failed.");
  }
  const plan = await DailyQuestRecordModel.find({
    userId: new Types.ObjectId("000000000000000000000001"),
    winterArcConfigId: new Types.ObjectId("000000000000000000000002"),
    date: { $gte: "2026-10-01", $lte: "2026-10-31" },
  }).explain("executionStats");
  if (!containsIndexName(plan, name)) {
    throw new Error("Calendar range query did not select the compound index.");
  }
  console.log("DAILY_QUEST_COMPOUND_INDEX=PASS");
  console.log("CALENDAR_RANGE_QUERY_INDEX=PASS");
  console.log(
    `DAILY_QUEST_RECORD_COUNT=${await DailyQuestRecordModel.countDocuments({})}`,
  );
} finally {
  await mongoose.disconnect();
}
