import { z } from "zod";
import { AVATAR_KEYS } from "@/lib/avatar-catalogue";
export const avatarSelectionSchema = z
  .object({ avatarKey: z.enum(AVATAR_KEYS).nullable() })
  .strict();
export type AvatarSelectionInput = z.infer<typeof avatarSelectionSchema>;
