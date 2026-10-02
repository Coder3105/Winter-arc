export const OTP_PURPOSES = ["REGISTER", "LOGIN", "GUILD_INVITE"] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];

export const PUBLIC_OTP_PURPOSES = ["REGISTER", "LOGIN"] as const;
export type PublicOtpPurpose = (typeof PUBLIC_OTP_PURPOSES)[number];

export const OTP_STATUSES = ["PENDING_SEND", "SENT", "CONSUMED", "INVALIDATED"] as const;
export type OtpStatus = (typeof OTP_STATUSES)[number];

export const OTP_TTL_SECONDS = 10 * 60;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_EMAIL_SEND_LIMIT = 5;
export const OTP_EMAIL_WINDOW_SECONDS = 15 * 60;
export const OTP_IP_REQUEST_LIMIT = 30;
export const OTP_IP_WINDOW_SECONDS = 60 * 60;
export const OTP_VERIFY_IP_LIMIT = 60;
