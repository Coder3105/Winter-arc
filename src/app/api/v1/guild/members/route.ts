import { successResponse } from "@/lib/validation/api-response";
import { handleApiError } from "@/server/errors/api-error-handler";
import { requireGuildApiUser } from "@/server/guild/guild-route";
import { getGuildMemberListProjection } from "@/server/services/guild-projection-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireGuildApiUser();
    return successResponse(await getGuildMemberListProjection(user.id));
  } catch (error) {
    return handleApiError(error);
  }
}
