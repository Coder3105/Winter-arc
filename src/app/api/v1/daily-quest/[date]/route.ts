import { failureResponse, successResponse } from "@/lib/validation/api-response";
import { parseCalendarDate } from "@/lib/utils/calendar-date";
import { getApiOwner } from "@/server/auth/api-auth";
import { handleApiError } from "@/server/errors/api-error-handler";
import { AppError } from "@/server/errors/app-error";
import { getDailyQuestByDate } from "@/server/services/daily-quest-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ date: string }> },
) {
  try {
    const owner = await getApiOwner();
    if (!owner)
      return failureResponse("UNAUTHORIZED", "Authentication is required.", 401);
    const { date } = await params;
    try {
      parseCalendarDate(date);
    } catch {
      throw new AppError("VALIDATION_ERROR");
    }
    const quest = await getDailyQuestByDate(owner.id, date);
    if (!quest) throw new AppError("DAILY_QUEST_NOT_FOUND");
    return successResponse(
      { quest },
      {
        status: 200,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
