import type { EmailMessage } from "@/server/email/email-provider";

export const AUTH_EMAIL_SUBJECTS = {
  registration: "Winter Arc — Verify Your Email",
  login: "Winter Arc — Login Request",
  guildInvite: "Winter Arc — Guild Invitation",
} as const;

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function emailShell(input: {
  readonly preheader: string;
  readonly marker: string;
  readonly title: string;
  readonly body: string;
  readonly code?: string;
  readonly footer: string;
}): string {
  const codeBlock = input.code
    ? `<tr><td style="padding:8px 32px 28px"><div style="border:1px solid #38d9ff;background:#07111f;color:#f3fbff;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:34px;font-weight:800;letter-spacing:10px;line-height:1.2;padding:20px 12px;text-align:center">${escapeHtml(input.code)}</div></td></tr>`
    : "";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#02040a;color:#dcecff;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(input.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:#02040a"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;border:1px solid #153e5a;background:#050b15">
<tr><td style="border-bottom:1px solid #153e5a;padding:24px 32px"><div style="color:#38d9ff;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;font-weight:700;letter-spacing:2px">WINTER ARC // ${escapeHtml(input.marker)}</div></td></tr>
<tr><td style="padding:32px 32px 14px"><h1 style="margin:0;color:#f3fbff;font-size:24px;line-height:1.25;letter-spacing:1px">${escapeHtml(input.title)}</h1></td></tr>
<tr><td style="padding:0 32px 24px;color:#9db4c7;font-size:15px;line-height:1.65">${input.body}</td></tr>
${codeBlock}
<tr><td style="border-top:1px solid #153e5a;padding:20px 32px;color:#668196;font-size:12px;line-height:1.6">${escapeHtml(input.footer)}</td></tr>
</table></td></tr></table></body></html>`;
}

interface OtpEmailInput {
  readonly to: string;
  readonly otp: string;
  readonly expiresInMinutes: number;
}

export function createRegistrationOtpEmail(input: OtpEmailInput): EmailMessage {
  const expiry = `${input.expiresInMinutes} minutes`;
  return {
    to: input.to,
    subject: AUTH_EMAIL_SUBJECTS.registration,
    html: emailShell({
      preheader: "Confirm your email to initialize a Winter Arc account.",
      marker: "IDENTITY INITIALIZATION",
      title: "VERIFY YOUR EMAIL",
      body: `<p style="margin:0">Enter this one-time code to finish creating your account. It expires in <strong style="color:#dcecff">${expiry}</strong>.</p>`,
      code: input.otp,
      footer:
        "If you did not request this account, you can safely ignore this message. Never share this code.",
    }),
    text: `WINTER ARC // IDENTITY INITIALIZATION\n\nVerify your email with this one-time code: ${input.otp}\n\nThe code expires in ${expiry}. If you did not request this account, ignore this message. Never share this code.`,
  };
}

export function createLoginOtpEmail(input: OtpEmailInput): EmailMessage {
  const expiry = `${input.expiresInMinutes} minutes`;
  return {
    to: input.to,
    subject: AUTH_EMAIL_SUBJECTS.login,
    html: emailShell({
      preheader: "A one-time Winter Arc access code was requested.",
      marker: "SECURE ACCESS",
      title: "LOGIN REQUEST",
      body: `<p style="margin:0">Use this code to authorize the current login request. It expires in <strong style="color:#dcecff">${expiry}</strong>.</p>`,
      code: input.otp,
      footer:
        "If this was not you, do not use the code. Your password remains unchanged.",
    }),
    text: `WINTER ARC // SECURE ACCESS\n\nYour login code is: ${input.otp}\n\nThe code expires in ${expiry}. If this was not you, ignore this message. Your password remains unchanged.`,
  };
}

export function createGuildInviteEmail(input: {
  readonly to: string;
  readonly inviterDisplayName: string;
  readonly otp: string;
  readonly expiresInMinutes: number;
}): EmailMessage {
  const inviter = escapeHtml(input.inviterDisplayName);
  const textInviter = input.inviterDisplayName.replace(/[\r\n]+/g, " ").trim();
  const expiry = `${input.expiresInMinutes} minutes`;
  return {
    to: input.to,
    subject: AUTH_EMAIL_SUBJECTS.guildInvite,
    html: emailShell({
      preheader: "A Hunter has requested a private Winter Arc Guild link.",
      marker: "SYSTEM NETWORK // GUILD",
      title: "GUILD REQUEST",
      body: `<p style="margin:0 0 14px"><strong style="color:#dcecff">${inviter}</strong> has invited you to connect through Winter Arc.</p><p style="margin:0">If you approve this connection, give the verification code to <strong style="color:#dcecff">${inviter}</strong>. They must enter it from their outgoing Guild request. The code expires in <strong style="color:#dcecff">${expiry}</strong>.</p>`,
      code: input.otp,
      footer:
        "Share this code only with the named inviter if you approve the Guild connection. Otherwise, ignore this request.",
    }),
    text: `WINTER ARC // SYSTEM NETWORK // GUILD\n\nA HUNTER HAS REQUESTED A GUILD LINK\n\n${textInviter} has invited you to connect through Winter Arc.\n\nVerification code: ${input.otp}\n\nIf you approve this connection, give this code to ${textInviter}. They must enter it from their outgoing Guild request. The code expires in ${expiry}. Otherwise, ignore this request.`,
  };
}
