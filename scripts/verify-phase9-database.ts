import mongoose from "mongoose";

import { connectToDatabase } from "@/server/db/mongoose";
import { AchievementUnlockModel } from "@/server/models/achievement-unlock";
import { RecoveryProtocolModel } from "@/server/models/recovery-protocol";
import { RewardGrantModel } from "@/server/models/reward-grant";

try {
  await connectToDatabase();
  await Promise.all([
    AchievementUnlockModel.init(),
    RewardGrantModel.init(),
    RecoveryProtocolModel.init(),
  ]);
  const contracts = [
    [
      AchievementUnlockModel,
      "unique_achievement_unlock",
      { userId: 1, winterArcConfigId: 1, achievementKey: 1, achievementVersion: 1 },
    ],
    [
      RewardGrantModel,
      "unique_reward_grant",
      { userId: 1, winterArcConfigId: 1, rewardType: 1, rewardKey: 1 },
    ],
    [
      RecoveryProtocolModel,
      "unique_recovery_source",
      { userId: 1, winterArcConfigId: 1, type: 1, sourceKey: 1 },
    ],
  ] as const;
  for (const [model, name, key] of contracts) {
    const index = (await model.collection.indexes()).find((item) => item.name === name);
    if (!index?.unique || JSON.stringify(index.key) !== JSON.stringify(key))
      throw new Error(`${name} verification failed.`);
    console.log(`${name.toUpperCase()}=PASS`);
  }
  console.log(
    `ACHIEVEMENT_UNLOCK_COUNT=${await AchievementUnlockModel.countDocuments({})}`,
  );
  console.log(`REWARD_GRANT_COUNT=${await RewardGrantModel.countDocuments({})}`);
  console.log(
    `RECOVERY_PROTOCOL_COUNT=${await RecoveryProtocolModel.countDocuments({})}`,
  );
} finally {
  await mongoose.disconnect();
}
