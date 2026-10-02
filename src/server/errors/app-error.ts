export type AppErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "QUEST_NOT_AVAILABLE"
  | "WINTER_ARC_NOT_ACTIVE"
  | "RULE_NOT_FOUND"
  | "INVALID_RULE_VALUE"
  | "DAILY_QUEST_NOT_FOUND"
  | "WORKOUT_NOT_AVAILABLE"
  | "WORKOUT_NOT_FOUND"
  | "WEIGHT_NOT_AVAILABLE"
  | "WEIGHT_NOT_FOUND"
  | "WEIGHT_SOURCE_REQUIRED"
  | "TITLE_NOT_UNLOCKED"
  | "REPORT_NOT_AVAILABLE"
  | "NOTIFICATION_NOT_AVAILABLE"
  | "NOTIFICATION_NOT_FOUND"
  | "PUSH_NOT_AVAILABLE"
  | "ACCOUNT_ALREADY_EXISTS"
  | "OTP_INVALID"
  | "OTP_RATE_LIMITED"
  | "OTP_RESEND_COOLDOWN"
  | "OTP_NOT_CONFIGURED"
  | "EMAIL_NOT_CONFIGURED"
  | "EMAIL_DELIVERY_FAILED"
  | "CANNOT_INVITE_SELF"
  | "GUILD_INVITE_PENDING"
  | "GUILD_ALREADY_CONNECTED"
  | "GUILD_INVITE_NOT_FOUND"
  | "GUILD_INVITE_EXPIRED"
  | "GUILD_ACCOUNT_NOT_FOUND"
  | "GUILD_MEMBER_NOT_FOUND"
  | "GUILD_ACCESS_DENIED"
  | "GUILD_BLOCKED"
  | "GUILD_SHARING_DISABLED"
  | "DATABASE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export interface ErrorDefinition {
  readonly status: number;
  readonly message: string;
}

export const ERROR_DEFINITIONS = {
  VALIDATION_ERROR: {
    status: 400,
    message: "The request is invalid.",
  },
  UNAUTHORIZED: {
    status: 401,
    message: "Authentication is required.",
  },
  FORBIDDEN: {
    status: 403,
    message: "This action is not permitted.",
  },
  NOT_FOUND: {
    status: 404,
    message: "The requested resource was not found.",
  },
  CONFLICT: {
    status: 409,
    message: "The request conflicts with the current state.",
  },
  QUEST_NOT_AVAILABLE: {
    status: 409,
    message: "A Daily Quest is not available for this date.",
  },
  WINTER_ARC_NOT_ACTIVE: {
    status: 409,
    message: "Activate the Winter Arc before using Daily Quests.",
  },
  RULE_NOT_FOUND: {
    status: 404,
    message: "The requested rule is not part of today's Daily Quest.",
  },
  INVALID_RULE_VALUE: {
    status: 400,
    message: "The rule response does not match its configured type.",
  },
  DAILY_QUEST_NOT_FOUND: {
    status: 404,
    message: "No Daily Quest record exists for this date.",
  },
  WORKOUT_NOT_AVAILABLE: {
    status: 409,
    message: "Workout tracking is not available for this protocol date.",
  },
  WORKOUT_NOT_FOUND: {
    status: 404,
    message: "The workout record was not found.",
  },
  WEIGHT_NOT_AVAILABLE: {
    status: 409,
    message: "Weight tracking is not available for this protocol date.",
  },
  WEIGHT_NOT_FOUND: {
    status: 404,
    message: "No weight record exists for today.",
  },
  WEIGHT_SOURCE_REQUIRED: {
    status: 409,
    message: "Morning Weight is managed by the canonical weight record.",
  },
  TITLE_NOT_UNLOCKED: {
    status: 409,
    message: "The selected title is not currently unlocked.",
  },
  REPORT_NOT_AVAILABLE: {
    status: 409,
    message: "The requested weekly report is not available.",
  },
  NOTIFICATION_NOT_AVAILABLE: {
    status: 409,
    message:
      "Notification preferences are not available until profile setup is complete.",
  },
  NOTIFICATION_NOT_FOUND: {
    status: 404,
    message: "The notification was not found.",
  },
  PUSH_NOT_AVAILABLE: {
    status: 409,
    message: "Device push notifications are not available in this environment.",
  },
  ACCOUNT_ALREADY_EXISTS: {
    status: 409,
    message: "An account already exists for this email.",
  },
  OTP_INVALID: {
    status: 400,
    message: "The authentication code is invalid or expired.",
  },
  OTP_RATE_LIMITED: {
    status: 429,
    message: "Too many authentication requests. Try again later.",
  },
  OTP_RESEND_COOLDOWN: {
    status: 429,
    message: "Wait before requesting another authentication code.",
  },
  OTP_NOT_CONFIGURED: {
    status: 503,
    message: "Email code authentication is not configured.",
  },
  EMAIL_NOT_CONFIGURED: {
    status: 503,
    message: "Email delivery is not configured.",
  },
  EMAIL_DELIVERY_FAILED: {
    status: 503,
    message: "The authentication email could not be delivered.",
  },
  CANNOT_INVITE_SELF: {
    status: 400,
    message: "You cannot send a Guild invitation to your own email.",
  },
  GUILD_INVITE_PENDING: {
    status: 409,
    message: "A Guild request is already pending between these accounts.",
  },
  GUILD_ALREADY_CONNECTED: {
    status: 409,
    message: "This member is already connected to your Guild.",
  },
  GUILD_INVITE_NOT_FOUND: {
    status: 404,
    message: "The Guild invitation was not found.",
  },
  GUILD_INVITE_EXPIRED: {
    status: 410,
    message: "The Guild invitation has expired.",
  },
  GUILD_ACCOUNT_NOT_FOUND: {
    status: 404,
    message: "No active Winter Arc account exists for this email.",
  },
  GUILD_MEMBER_NOT_FOUND: {
    status: 404,
    message: "The Guild member was not found.",
  },
  GUILD_ACCESS_DENIED: {
    status: 403,
    message: "An active Guild connection is required.",
  },
  GUILD_BLOCKED: {
    status: 403,
    message: "Guild requests are blocked for this connection.",
  },
  GUILD_SHARING_DISABLED: {
    status: 403,
    message: "This Guild member has not shared that information.",
  },
  DATABASE_UNAVAILABLE: {
    status: 503,
    message: "Database connection unavailable.",
  },
  INTERNAL_ERROR: {
    status: 500,
    message: "An unexpected error occurred.",
  },
} as const satisfies Record<AppErrorCode, ErrorDefinition>;

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;

  constructor(code: AppErrorCode) {
    const definition = ERROR_DEFINITIONS[code];
    super(definition.message);
    this.name = "AppError";
    this.code = code;
    this.status = definition.status;
  }
}

export interface PublicError {
  readonly code: AppErrorCode;
  readonly message: string;
  readonly status: number;
}

export function mapErrorToPublicError(error: unknown): PublicError {
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message,
      status: error.status,
    };
  }

  const fallback = ERROR_DEFINITIONS.INTERNAL_ERROR;

  return {
    code: "INTERNAL_ERROR",
    message: fallback.message,
    status: fallback.status,
  };
}
