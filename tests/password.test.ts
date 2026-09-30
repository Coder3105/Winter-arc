import { describe, expect, it } from "vitest";

import { hashPassword, PASSWORD_COST, verifyPassword } from "@/server/auth/password";

describe("password security", () => {
  it("hashes passwords with bcrypt and the configured cost", async () => {
    const password = "a-strong-owner-password";
    const hash = await hashPassword(password);

    expect(hash).not.toBe(password);
    expect(hash.startsWith("$2")).toBe(true);
    expect(Number(hash.split("$")[2])).toBe(PASSWORD_COST);
    await expect(verifyPassword(password, hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct-owner-password");
    await expect(verifyPassword("incorrect-owner-password", hash)).resolves.toBe(false);
  });
});
