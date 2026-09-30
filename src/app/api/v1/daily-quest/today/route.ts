import { dailyQuestResponseInputSchema } from "@/lib/validation/daily-quest";
import { failureResponse, successResponse } from "@/lib/validation/api-response";
import { getApiOwner } from "@/server/auth/api-auth";
import { handleApiError } from "@/server/errors/api-error-handler";
import { readValidatedJson } from "@/server/http/validate-request";
import {
  getOrCreateTodayDailyQuest,
  updateTodayDailyQuestResponse,
} from "@/server/services/daily-quest-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const owner = await getApiOwner();
    if (!owner)
      return failureResponse("UNAUTHORIZED", "Authentication is required.", 401);
    return successResponse(await getOrCreateTodayDailyQuest(owner.id), {
      status: 200,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const owner = await getApiOwner();
    if (!owner)
      return failureResponse("UNAUTHORIZED", "Authentication is required.", 401);
    const input = await readValidatedJson(request, dailyQuestResponseInputSchema);
    return successResponse({
      quest: await updateTodayDailyQuestResponse(owner.id, input),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
