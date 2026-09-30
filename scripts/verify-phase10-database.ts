import mongoose from "mongoose";

import { connectToDatabase } from "@/server/db/mongoose";
import { WeeklyReportModel } from "@/server/models/weekly-report";

try {
  await connectToDatabase();
  await WeeklyReportModel.init();
  const indexes = await WeeklyReportModel.collection.indexes();
  const unique = indexes.find((item) => item.name === "unique_final_weekly_report");
  const expected = {
    userId: 1,
    winterArcConfigId: 1,
    challengeWeek: 1,
    reportPolicyVersion: 1,
  };
  if (!unique?.unique || JSON.stringify(unique.key) !== JSON.stringify(expected))
    throw new Error("unique_final_weekly_report verification failed.");
  const history = indexes.find((item) => item.name === "weekly_report_history");
  if (!history) throw new Error("weekly_report_history verification failed.");
  console.log("WEEKLY_REPORT_UNIQUE_INDEX=PASS");
  console.log("WEEKLY_REPORT_HISTORY_INDEX=PASS");
  console.log(`WEEKLY_REPORT_COUNT=${await WeeklyReportModel.countDocuments({})}`);
} finally {
  await mongoose.disconnect();
}
