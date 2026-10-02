import { cookies } from "next/headers";

import { verifyRegistrationOtpSchema } from "@/lib/validation/auth";
import { successResponse } from "@/lib/validation/api-response";
import { getRequestClientAddress } from "@/server/auth/auth-rate-limiter";
import { verifyRegistrationOtp } from "@/server/auth/email-otp-service";
import { createSession } from "@/server/auth/auth-service";
import {
  getSessionCookieOptions,
  SESSION_COOKIE_NAME,
} from "@/server/auth/session-token";
import { handleApiError } from "@/server/errors/api-error-handler";
import { assertSameOriginRequest } from "@/server/http/same-origin";
import { readValidatedJson } from "@/server/http/validate-request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const input = await readValidatedJson(request, verifyRegistrationOtpSchema);
    const owner = await verifyRegistrationOtp({
      ...input,
      clientAddress: getRequestClientAddress(request),
    });
    const session = await createSession(
      owner.id,
      request.headers.get("user-agent")?.slice(0, 500) ?? null,
    );
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, session.token, getSessionCookieOptions());
    return successResponse({ owner });
  } catch (error) {
    return handleApiError(error);
  }
}
