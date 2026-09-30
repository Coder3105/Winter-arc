import type { NextRequest } from "next/server";

import { calendarMonthSchema } from "@/lib/validation/calendar-history";
import { failureResponse, successResponse } from "@/lib/validation/api-response";
import { getApiOwner } from "@/server/auth/api-auth";
import { handleApiError } from "@/server/errors/api-error-handler";
import { getCalendarMonthHistory } from "@/server/services/history-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const owner = await getApiOwner();
    if (!owner)
      return failureResponse("UNAUTHORIZED", "Authentication is required.", 401);
    const parsed = calendarMonthSchema.safeParse(
      request.nextUrl.searchParams.get("month"),
    );
    if (!parsed.success)
      return failureResponse(
        "VALIDATION_ERROR",
        "Month must use valid YYYY-MM format.",
        400,
      );
    return successResponse(await getCalendarMonthHistory(owner.id, parsed.data), {
      status: 200,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
