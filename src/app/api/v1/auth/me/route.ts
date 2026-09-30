import { failureResponse, successResponse } from "@/lib/validation/api-response";
import { getApiOwner } from "@/server/auth/api-auth";
import { handleApiError } from "@/server/errors/api-error-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const owner = await getApiOwner();
    if (!owner) {
      return failureResponse("UNAUTHORIZED", "Authentication is required.", 401);
    }
    return successResponse({ owner });
  } catch (error) {
    return handleApiError(error);
  }
}
