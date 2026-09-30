import { failureResponse, successResponse } from "@/lib/validation/api-response";
import { titleSelectionSchema } from "@/lib/validation/profile";
import { getApiOwner } from "@/server/auth/api-auth";
import { handleApiError } from "@/server/errors/api-error-handler";
import { readValidatedJson } from "@/server/http/validate-request";
import { selectSystemTitle } from "@/server/services/achievement-reward-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  try {
    const owner = await getApiOwner();
    if (!owner)
      return failureResponse("UNAUTHORIZED", "Authentication is required.", 401);
    const input = await readValidatedJson(request, titleSelectionSchema);
    return successResponse(await selectSystemTitle(owner.id, input.title), {
      status: 200,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
