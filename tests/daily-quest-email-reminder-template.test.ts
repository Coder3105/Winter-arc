import { describe, expect, it } from "vitest";

import {
  DAILY_QUEST_REMINDER_SUBJECT,
  createDailyQuestReminderEmail,
} from "@/server/email/templates/daily-quest-reminder-email";

describe("Daily Quest reminder email template", () => {
  it("renders the shared dark System email as HTML and text with a canonical CTA", () => {
    const message = createDailyQuestReminderEmail({
      to: "owner@example.test",
      completed: 3,
      total: 5,
      applicationOrigin: "https://winter.example.test",
    });
    expect(message.subject).toBe("Winter Arc \u2014 Daily Quest Pending");
    expect(message.subject).toBe(DAILY_QUEST_REMINDER_SUBJECT);
    expect(message.html).toContain("WINTER ARC // SYSTEM REMINDER");
    expect(message.html).toContain("3 / 5 objectives");
    expect(message.html).toContain("https://winter.example.test/today");
    expect(message.text).toContain("3 / 5 objectives");
    expect(message.text).toContain("https://winter.example.test/today");
  });

  it("contains no private rule, body composition, OTP, or secret data", () => {
    const message = createDailyQuestReminderEmail({
      to: "owner@example.test",
      completed: 0,
      total: 4,
      applicationOrigin: "https://winter.example.test",
    });
    const visibleHtml = message.html.replace(/<[^>]+>/g, " ");
    const rendered = `${message.subject}\n${visibleHtml}\n${message.text}`;
    for (const forbidden of [
      "No Fap",
      "no_fap",
      "weight",
      "body-fat",
      "BMI",
      "OTP",
      "CRON_SECRET",
      "GMAIL_APP_PASSWORD",
    ])
      expect(rendered.toLowerCase()).not.toContain(forbidden.toLowerCase());
  });
});
