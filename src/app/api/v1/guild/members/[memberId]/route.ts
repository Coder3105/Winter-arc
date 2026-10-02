import { successResponse } from "@/lib/validation/api-response";
import { handleApiError } from "@/server/errors/api-error-handler";
import { requireGuildApiUser, validateGuildId } from "@/server/guild/guild-route";
import { assertSameOriginRequest } from "@/server/http/same-origin";
import { removeGuildMember } from "@/server/services/guild-connection-service";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ memberId: string }> },
) {
  try {
    assertSameOriginRequest(request);
    const user = await requireGuildApiUser();
    const { memberId } = await params;
    return successResponse(await removeGuildMember(user.id, validateGuildId(memberId)));
  } catch (error) {
    return handleApiError(error);
  }
}
