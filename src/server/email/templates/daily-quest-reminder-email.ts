import type { EmailMessage } from "@/server/email/email-provider";

import { emailShell, escapeHtml } from "./auth-emails";

export const DAILY_QUEST_REMINDER_SUBJECT = "Winter Arc \u2014 Daily Quest Pending";

export function createDailyQuestReminderEmail(input: {
  readonly to: string;
  readonly completed: number;
  readonly total: number;
  readonly applicationOrigin: string;
}): EmailMessage {
  const todayUrl = new URL("/today", input.applicationOrigin).toString();
  const count = `${input.completed} / ${input.total} objectives`;
  const safeUrl = escapeHtml(todayUrl);

  return {
    to: input.to,
    subject: DAILY_QUEST_REMINDER_SUBJECT,
    html: emailShell({
      preheader: "Your Daily Quest is still in progress.",
      marker: "SYSTEM REMINDER",
      title: "DAILY QUEST INCOMPLETE",
      body: `<p style="margin:0 0 18px">Your Daily Quest for today is still in progress.</p><div style="margin:0 0 22px;border:1px solid #153e5a;background:#07111f;padding:16px"><div style="color:#668196;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px;letter-spacing:2px">COMPLETION</div><div style="margin-top:8px;color:#f3fbff;font-size:22px;font-weight:800">${escapeHtml(count)}</div></div><p style="margin:0 0 22px">Complete the remaining objectives before the day ends.</p><a href="${safeUrl}" style="display:inline-block;border:1px solid #38d9ff;background:#071a27;color:#dcecff;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;font-weight:700;letter-spacing:1px;padding:14px 20px;text-decoration:none">OPEN WINTER ARC</a>`,
      footer: "SYSTEM // DAILY PROTOCOL",
    }),
    text: `WINTER ARC // SYSTEM REMINDER\n\nDAILY QUEST INCOMPLETE\n\nYour Daily Quest for today is still in progress.\n\nCOMPLETION\n${count}\n\nComplete the remaining objectives before the day ends.\n\nOPEN WINTER ARC\n${todayUrl}\n\nSYSTEM // DAILY PROTOCOL`,
  };
}
