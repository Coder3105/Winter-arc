import { guildInviteSchema } from "@/lib/validation/guild";
import { successResponse } from "@/lib/validation/api-response";
import { getRequestClientAddress } from "@/server/auth/auth-rate-limiter";
import { handleApiError } from "@/server/errors/api-error-handler";
import { requireGuildApiUser } from "@/server/guild/guild-route";
import { assertSameOriginRequest } from "@/server/http/same-origin";
import { readValidatedJson } from "@/server/http/validate-request";
import {
  listGuildInvites,
  sendGuildInvite,
} from "@/server/services/guild-invite-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return successResponse(await listGuildInvites(await requireGuildApiUser()));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const user = await requireGuildApiUser();
    const input = await readValidatedJson(request, guildInviteSchema, {
      maxBytes: 2_048,
    });
    return successResponse(
      await sendGuildInvite(user, input.email, getRequestClientAddress(request)),
      { status: 202 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
