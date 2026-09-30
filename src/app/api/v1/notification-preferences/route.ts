import { failureResponse, successResponse } from "@/lib/validation/api-response";
import { notificationPreferencesInputSchema } from "@/lib/validation/notification-preferences";
import { getApiOwner } from "@/server/auth/api-auth";
import { handleApiError } from "@/server/errors/api-error-handler";
import { readValidatedJson } from "@/server/http/validate-request";
import {
  getNotificationPreferences,
  saveNotificationPreferences,
} from "@/server/services/notification-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const owner = await getApiOwner();
    if (!owner)
      return failureResponse("UNAUTHORIZED", "Authentication is required.", 401);
    return successResponse(await getNotificationPreferences(owner.id), {
      status: 200,
      headers: privateHeaders,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const owner = await getApiOwner();
    if (!owner)
      return failureResponse("UNAUTHORIZED", "Authentication is required.", 401);
    const input = await readValidatedJson(request, notificationPreferencesInputSchema);
    return successResponse(await saveNotificationPreferences(owner.id, input), {
      status: 200,
      headers: privateHeaders,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
