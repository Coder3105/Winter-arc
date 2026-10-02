import { successResponse } from "@/lib/validation/api-response";
import { handleApiError } from "@/server/errors/api-error-handler";
import { requireGuildApiUser, validateGuildId } from "@/server/guild/guild-route";
import { getGuildMemberProfileProjection } from "@/server/services/guild-projection-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ memberId: string }> },
) {
  try {
    const user = await requireGuildApiUser();
    const { memberId } = await params;
    return successResponse(
      await getGuildMemberProfileProjection(user.id, validateGuildId(memberId)),
    );
  } catch (error) {
    return handleApiError(error);
  }
}
