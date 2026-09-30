import mongoose, { Types } from "mongoose";

import { connectToDatabase } from "@/server/db/mongoose";
import { WeightRecordModel } from "@/server/models/weight-record";

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
  await WeightRecordModel.init();
  const indexes = await WeightRecordModel.collection.indexes();
  const name = "unique_weight_per_protocol_day";
  const compound = indexes.find((index) => index.name === name);
  if (
    !compound?.unique ||
    JSON.stringify(compound.key) !==
      JSON.stringify({ userId: 1, winterArcConfigId: 1, date: 1 })
  ) {
    throw new Error("Weight unique date index verification failed.");
  }
  const plan = await WeightRecordModel.find({
    userId: new Types.ObjectId("000000000000000000000001"),
    winterArcConfigId: new Types.ObjectId("000000000000000000000002"),
    date: { $gte: "2026-09-01", $lte: "2026-09-30" },
  }).explain("executionStats");
  if (!containsIndex(plan, name)) {
    throw new Error("Weight date-range query did not select the compound index.");
  }
  console.log("WEIGHT_COLLECTION=PASS");
  console.log("WEIGHT_UNIQUE_DAILY_INDEX=PASS");
  console.log("WEIGHT_RANGE_QUERY_INDEX=PASS");
  console.log(`WEIGHT_RECORD_COUNT=${await WeightRecordModel.countDocuments({})}`);
} finally {
  await mongoose.disconnect();
}
