import { successResponse } from "@/lib/validation/api-response";
import { guildSharingSchema } from "@/lib/validation/guild";
import { handleApiError } from "@/server/errors/api-error-handler";
import { requireGuildApiUser } from "@/server/guild/guild-route";
import { assertSameOriginRequest } from "@/server/http/same-origin";
import { readValidatedJson } from "@/server/http/validate-request";
import {
  getGuildSharingPreferences,
  updateGuildSharingPreferences,
} from "@/server/services/guild-sharing-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireGuildApiUser();
    return successResponse(await getGuildSharingPreferences(user.id));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOriginRequest(request);
    const user = await requireGuildApiUser();
    const input = await readValidatedJson(request, guildSharingSchema, {
      maxBytes: 4_096,
    });
    return successResponse(await updateGuildSharingPreferences(user.id, input));
  } catch (error) {
    return handleApiError(error);
  }
}
