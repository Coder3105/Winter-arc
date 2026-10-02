import { successResponse } from "@/lib/validation/api-response";
import { avatarSelectionSchema } from "@/lib/validation/avatar";
import { getApiOwner } from "@/server/auth/api-auth";
import { handleApiError } from "@/server/errors/api-error-handler";
import { AppError } from "@/server/errors/app-error";
import { assertSameOriginRequest } from "@/server/http/same-origin";
import { readValidatedJson } from "@/server/http/validate-request";
import { updateProfileAvatar } from "@/server/services/avatar-service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function PUT(request: Request) {
  try {
    assertSameOriginRequest(request);
    const user = await getApiOwner();
    if (!user) throw new AppError("UNAUTHORIZED");
    const input = await readValidatedJson(request, avatarSelectionSchema, {
      maxBytes: 1024,
    });
    return successResponse(await updateProfileAvatar(user.id, input));
  } catch (error) {
    return handleApiError(error);
  }
}
