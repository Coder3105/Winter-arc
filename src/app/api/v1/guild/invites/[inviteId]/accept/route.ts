import { guildAcceptSchema } from "@/lib/validation/guild";
import { successResponse } from "@/lib/validation/api-response";
import { getRequestClientAddress } from "@/server/auth/auth-rate-limiter";
import { handleApiError } from "@/server/errors/api-error-handler";
import { requireGuildApiUser, validateGuildId } from "@/server/guild/guild-route";
import { assertSameOriginRequest } from "@/server/http/same-origin";
import { readValidatedJson } from "@/server/http/validate-request";
import { acceptGuildInvite } from "@/server/services/guild-invite-service";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ inviteId: string }> },
) {
  try {
    assertSameOriginRequest(request);
    const user = await requireGuildApiUser();
    const { inviteId } = await params;
    const input = await readValidatedJson(request, guildAcceptSchema, {
      maxBytes: 2_048,
    });
    return successResponse(
      await acceptGuildInvite(
        user,
        validateGuildId(inviteId),
        input,
        getRequestClientAddress(request),
      ),
    );
  } catch (error) {
    return handleApiError(error);
  }
}
