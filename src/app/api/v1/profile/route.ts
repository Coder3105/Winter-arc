import { profileInputSchema } from "@/lib/validation/profile";
import { failureResponse, successResponse } from "@/lib/validation/api-response";
import { getApiOwner } from "@/server/auth/api-auth";
import { handleApiError } from "@/server/errors/api-error-handler";
import { readValidatedJson } from "@/server/http/validate-request";
import { getProfile, saveProfile } from "@/server/services/profile-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const owner = await getApiOwner();
    if (!owner) {
      return failureResponse("UNAUTHORIZED", "Authentication is required.", 401);
    }
    return successResponse({ profile: await getProfile(owner.id) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const owner = await getApiOwner();
    if (!owner) {
      return failureResponse("UNAUTHORIZED", "Authentication is required.", 401);
    }
    const input = await readValidatedJson(request, profileInputSchema);
    return successResponse({ profile: await saveProfile(owner.id, input) });
  } catch (error) {
    return handleApiError(error);
  }
}
