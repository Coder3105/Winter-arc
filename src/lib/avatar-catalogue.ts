/** Stable, local-only cosmetic identities. Never remove a key already in use. */
export const AVATAR_KEYS = [
  "VOID_COMMANDER",
  "FROST_REAPER",
  "ABYSS_KNIGHT",
  "NIGHT_ASSASSIN",
  "SHADOW_MAGE",
  "ICE_SENTINEL",
  "VOID_BEAST",
  "DARK_VANGUARD",
  "PHANTOM_ARCHER",
  "SYSTEM_HUNTER",
] as const;

export type AvatarKey = (typeof AVATAR_KEYS)[number];
export interface AvatarDefinition {
  readonly key: AvatarKey | "SYSTEM_DEFAULT";
  readonly name: string;
  readonly description: string;
  readonly imagePath: string;
  readonly order: number;
}

const portraits = [
  ["VOID_COMMANDER", "Void Commander", "A steady presence at the edge of the unknown."],
  ["FROST_REAPER", "Frost Reaper", "Quiet resolve beneath a winter veil."],
  ["ABYSS_KNIGHT", "Abyss Knight", "An unbroken guard in obsidian armor."],
  ["NIGHT_ASSASSIN", "Night Assassin", "Focus sharpened in the stillness of night."],
  ["SHADOW_MAGE", "Shadow Mage", "Patience and knowledge shaped into power."],
  ["ICE_SENTINEL", "Ice Sentinel", "A crystalline guardian of the long winter."],
  ["VOID_BEAST", "Void Beast", "A watchful creature born of the quiet dark."],
  ["DARK_VANGUARD", "Dark Vanguard", "The first to stand and the last to yield."],
  ["PHANTOM_ARCHER", "Phantom Archer", "A clear aim through the winter haze."],
  [
    "SYSTEM_HUNTER",
    "System Hunter",
    "Every new chapter begins with one deliberate step.",
  ],
] as const satisfies readonly (readonly [AvatarKey, string, string])[];

export const SYSTEM_DEFAULT: AvatarDefinition = {
  key: "SYSTEM_DEFAULT",
  name: "System Default",
  description: "The Winter Arc System mark. No character selected.",
  imagePath: "/images/avatars/system-default.webp",
  order: 0,
};
export const AVATAR_CATALOGUE: readonly AvatarDefinition[] = [
  SYSTEM_DEFAULT,
  ...portraits.map(([key, name, description], index) => ({
    key,
    name,
    description,
    imagePath: `/images/avatars/${key.toLowerCase().replaceAll("_", "-")}.webp`,
    order: index + 1,
  })),
];

export function normalizeAvatarKey(value: unknown): AvatarKey | null {
  return typeof value === "string" && AVATAR_KEYS.includes(value as AvatarKey)
    ? (value as AvatarKey)
    : null;
}

export function getAvatar(value: unknown): AvatarDefinition {
  const key = normalizeAvatarKey(value);
  return AVATAR_CATALOGUE.find((avatar) => avatar.key === key) ?? SYSTEM_DEFAULT;
}
