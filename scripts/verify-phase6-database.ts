import mongoose, { Types } from "mongoose";

import { connectToDatabase } from "@/server/db/mongoose";
import { WorkoutRecordModel } from "@/server/models/workout-record";

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
  await WorkoutRecordModel.init();
  const indexes = await WorkoutRecordModel.collection.indexes();
  const name = "workout_owner_protocol_date";
  const compound = indexes.find((index) => index.name === name);
  if (
    !compound ||
    compound.unique ||
    JSON.stringify(compound.key) !==
      JSON.stringify({ userId: 1, winterArcConfigId: 1, date: 1 })
  ) {
    throw new Error("Workout range index verification failed.");
  }
  const plan = await WorkoutRecordModel.find({
    userId: new Types.ObjectId("000000000000000000000001"),
    winterArcConfigId: new Types.ObjectId("000000000000000000000002"),
    date: { $gte: "2026-10-01", $lte: "2026-10-31" },
    status: "COMPLETED",
  }).explain("executionStats");
  if (!containsIndex(plan, name)) {
    throw new Error("Workout date-range query did not select the compound index.");
  }
  console.log("WORKOUT_COLLECTION=PASS");
  console.log("WORKOUT_NON_UNIQUE_RANGE_INDEX=PASS");
  console.log("WORKOUT_RANGE_QUERY_INDEX=PASS");
  console.log(`WORKOUT_RECORD_COUNT=${await WorkoutRecordModel.countDocuments({})}`);
} finally {
  await mongoose.disconnect();
}
