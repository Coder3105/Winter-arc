import { successResponse } from "@/lib/validation/api-response";
import { getRequestClientAddress } from "@/server/auth/auth-rate-limiter";
import { handleApiError } from "@/server/errors/api-error-handler";
import { requireGuildApiUser, validateGuildId } from "@/server/guild/guild-route";
import { assertSameOriginRequest } from "@/server/http/same-origin";
import { resendGuildInviteOtp } from "@/server/services/guild-invite-service";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ inviteId: string }> },
) {
  try {
    assertSameOriginRequest(request);
    const { inviteId } = await params;
    return successResponse(
      await resendGuildInviteOtp(
        await requireGuildApiUser(),
        validateGuildId(inviteId),
        getRequestClientAddress(request),
      ),
    );
  } catch (error) {
    return handleApiError(error);
  }
}
