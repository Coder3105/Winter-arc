import "server-only";

import { guildObjectIdSchema } from "@/lib/validation/guild";
import { getApiOwner } from "@/server/auth/api-auth";
import { AppError } from "@/server/errors/app-error";

export async function requireGuildApiUser() {
  const user = await getApiOwner();
  if (!user) throw new AppError("UNAUTHORIZED");
  return user;
}

export function validateGuildId(value: string): string {
  const parsed = guildObjectIdSchema.safeParse(value);
  if (!parsed.success) throw new AppError("VALIDATION_ERROR");
  return parsed.data;
}
