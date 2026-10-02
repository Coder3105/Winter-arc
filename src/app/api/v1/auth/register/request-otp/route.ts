import { requestEmailOtpSchema } from "@/lib/validation/auth";
import { successResponse } from "@/lib/validation/api-response";
import { getRequestClientAddress } from "@/server/auth/auth-rate-limiter";
import { requestRegistrationOtp } from "@/server/auth/email-otp-service";
import { handleApiError } from "@/server/errors/api-error-handler";
import { assertSameOriginRequest } from "@/server/http/same-origin";
import { readValidatedJson } from "@/server/http/validate-request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const input = await readValidatedJson(request, requestEmailOtpSchema);
    const verification = await requestRegistrationOtp(
      input.email,
      getRequestClientAddress(request),
    );
    return successResponse(verification, { status: 202 });
  } catch (error) {
    return handleApiError(error);
  }
}
