import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

import sharp from "sharp";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { AvatarPicker } from "@/components/profile/avatar-picker";
import { Avatar } from "@/components/profile/avatar";
import { SystemHeader } from "@/components/system/system-header";
import {
  AVATAR_CATALOGUE,
  AVATAR_KEYS,
  SYSTEM_DEFAULT,
  getAvatar,
  normalizeAvatarKey,
} from "@/lib/avatar-catalogue";
import { avatarSelectionSchema } from "@/lib/validation/avatar";
import { UserProfileModel } from "@/server/models/user-profile";

describe("V2.5 avatar catalogue and assets", () => {
  it("has one stable System default plus ten unique controlled portraits", () => {
    expect(SYSTEM_DEFAULT).toMatchObject({
      key: "SYSTEM_DEFAULT",
      imagePath: "/images/avatars/system-default.webp",
      order: 0,
    });
    expect(AVATAR_KEYS).toHaveLength(10);
    expect(AVATAR_CATALOGUE).toHaveLength(11);
    expect(new Set(AVATAR_KEYS).size).toBe(AVATAR_KEYS.length);
    expect(new Set(AVATAR_CATALOGUE.map(({ imagePath }) => imagePath)).size).toBe(
      AVATAR_CATALOGUE.length,
    );
    expect(AVATAR_CATALOGUE.map(({ order }) => order)).toEqual(
      Array.from({ length: 11 }, (_, index) => index),
    );
    for (const avatar of AVATAR_CATALOGUE) {
      expect(avatar.name.length).toBeGreaterThan(0);
      expect(avatar.description.length).toBeGreaterThan(0);
      expect(avatar.imagePath).toMatch(/^\/images\/avatars\/[a-z0-9-]+\.webp$/);
      expect(avatar.imagePath).not.toMatch(/\.\.|:\/\/|\\/);
    }
  });

  it.each(AVATAR_CATALOGUE)("ships a valid optimized $key image", async (avatar) => {
    const file = path.join(
      process.cwd(),
      "public",
      ...avatar.imagePath.split("/").slice(1),
    );
    const [stat, metadata] = await Promise.all([fs.stat(file), sharp(file).metadata()]);
    expect(stat.size).toBeGreaterThan(1_000);
    expect(stat.size).toBeLessThan(250_000);
    expect(metadata).toMatchObject({ format: "webp", width: 512, height: 512 });
  });

  it("ships distinct binary artwork for every catalogue identity", async () => {
    const hashes = await Promise.all(
      AVATAR_CATALOGUE.map(async ({ imagePath }) => {
        const file = path.join(process.cwd(), "public", ...imagePath.split("/").slice(1));
        return createHash("sha256")
          .update(await fs.readFile(file))
          .digest("hex");
      }),
    );
    expect(new Set(hashes).size).toBe(AVATAR_CATALOGUE.length);
  });

  it("falls back safely for null, unknown, and non-string legacy values", () => {
    expect(normalizeAvatarKey("VOID_COMMANDER")).toBe("VOID_COMMANDER");
    for (const value of [null, undefined, "SYSTEM_DEFAULT", "UNKNOWN", 3, {}]) {
      expect(normalizeAvatarKey(value)).toBeNull();
      expect(getAvatar(value)).toBe(SYSTEM_DEFAULT);
    }
  });

  it("accepts only a known key or null and rejects URLs, paths, and extra fields", () => {
    expect(avatarSelectionSchema.parse({ avatarKey: "ICE_SENTINEL" })).toEqual({
      avatarKey: "ICE_SENTINEL",
    });
    expect(avatarSelectionSchema.parse({ avatarKey: null })).toEqual({ avatarKey: null });
    for (const avatarKey of [
      "https://evil.test/avatar.webp",
      "/images/avatars/void-commander.webp",
      "../private/avatar.webp",
      "<img src=x onerror=alert(1)>",
      "UNKNOWN",
    ]) {
      expect(avatarSelectionSchema.safeParse({ avatarKey }).success).toBe(false);
    }
    expect(
      avatarSelectionSchema.safeParse({ avatarKey: "VOID_COMMANDER", userId: "other" })
        .success,
    ).toBe(false);
  });

  it("keeps avatarKey optional for existing profiles and validates future writes", () => {
    const avatarPath = UserProfileModel.schema.path("avatarKey") as unknown as {
      options: { default: unknown; enum: readonly unknown[] };
    };
    expect(avatarPath.options.default).toBeNull();
    expect(avatarPath.options.enum).toEqual(
      expect.arrayContaining([...AVATAR_KEYS, null]),
    );
    expect(UserProfileModel.schema.indexes()).not.toEqual(
      expect.arrayContaining([[{ avatarKey: 1 }, expect.anything()]]),
    );
  });

  it("renders the selected identity, safe fallback, and explicit picker state", () => {
    const selected = renderToStaticMarkup(
      createElement(Avatar, { avatarKey: "FROST_REAPER", size: 64 }),
    );
    const fallback = renderToStaticMarkup(
      createElement(Avatar, { avatarKey: "UNKNOWN", size: 64 }),
    );
    const picker = renderToStaticMarkup(
      createElement(AvatarPicker, { initialAvatarKey: "FROST_REAPER" }),
    );
    expect(selected).toContain("frost-reaper.webp");
    expect(selected).toContain('alt="Frost Reaper avatar"');
    expect(fallback).toContain("system-default.webp");
    expect(picker).toContain('aria-pressed="true"');
    expect(picker).toContain("SAVE AVATAR");
    expect(picker).toContain("RESET TO DEFAULT");
    expect(picker).toContain("CURRENT AVATAR: Frost Reaper");
  });

  it("renders the original brand mark in the shared Login/Register header", () => {
    const header = renderToStaticMarkup(
      createElement(SystemHeader, { title: "WINTER ARC", label: "SYSTEM // ACCESS" }),
    );
    expect(header).toContain("/icons/system-mark.svg");
    expect(header).toContain("WINTER ARC");
  });
});
