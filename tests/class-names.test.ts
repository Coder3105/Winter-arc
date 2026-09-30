import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils/class-names";

describe("cn", () => {
  it("joins truthy class names in order", () => {
    expect(cn("system-panel", false, undefined, "system-panel--glow", null)).toBe(
      "system-panel system-panel--glow",
    );
  });
});
