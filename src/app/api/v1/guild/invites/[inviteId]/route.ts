import { successResponse } from "@/lib/validation/api-response";
import { handleApiError } from "@/server/errors/api-error-handler";
import { requireGuildApiUser, validateGuildId } from "@/server/guild/guild-route";
import { assertSameOriginRequest } from "@/server/http/same-origin";
import { cancelGuildInvite } from "@/server/services/guild-invite-service";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ inviteId: string }> },
) {
  try {
    assertSameOriginRequest(request);
    const { inviteId } = await params;
    return successResponse(
      await cancelGuildInvite(await requireGuildApiUser(), validateGuildId(inviteId)),
    );
  } catch (error) {
    return handleApiError(error);
  }
}
