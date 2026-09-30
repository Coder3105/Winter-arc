import { describe, expect, it } from "vitest";

import {
  calculateProtocolEndDate,
  formatCalendarDate,
  parseCalendarDate,
} from "@/lib/utils/calendar-date";

describe("protocol calendar dates", () => {
  it("uses inclusive duration semantics", () => {
    const start = parseCalendarDate("2026-10-01");
    expect(formatCalendarDate(calculateProtocolEndDate(start, 90))).toBe("2026-12-29");
  });

  it("rejects impossible calendar dates", () => {
    expect(() => parseCalendarDate("2026-02-30")).toThrow();
  });
});
