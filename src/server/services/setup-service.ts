import "server-only";

import { getProfile } from "./profile-service";
import { getWinterArcConfig } from "./winter-arc-service";

export interface SetupState {
  readonly complete: boolean;
}

export async function getSetupState(userId: string): Promise<SetupState> {
  const [profile, config] = await Promise.all([
    getProfile(userId),
    getWinterArcConfig(userId),
  ]);

  return { complete: Boolean(profile && config?.status === "ACTIVE") };
}
