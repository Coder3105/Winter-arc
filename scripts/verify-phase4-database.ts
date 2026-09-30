import mongoose from "mongoose";

import { connectToDatabase } from "@/server/db/mongoose";
import { DailyQuestRecordModel } from "@/server/models/daily-quest-record";

try {
  await connectToDatabase();
  await DailyQuestRecordModel.init();
  const indexes = await DailyQuestRecordModel.collection.indexes();
  const uniqueDaily = indexes.find(
    (index) => index.name === "unique_daily_quest_per_protocol",
  );
  if (
    !uniqueDaily?.unique ||
    JSON.stringify(uniqueDaily.key) !==
      JSON.stringify({ userId: 1, winterArcConfigId: 1, date: 1 })
  ) {
    throw new Error("Daily Quest unique index verification failed.");
  }
  const recordCount = await DailyQuestRecordModel.countDocuments({});
  console.log("DAILY_QUEST_COLLECTION=PASS");
  console.log("UNIQUE_DAILY_INDEX=PASS");
  console.log(`DAILY_QUEST_RECORD_COUNT=${recordCount}`);
} finally {
  await mongoose.disconnect();
}
