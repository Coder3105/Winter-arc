import type { NextRequest } from "next/server";

import { calendarMonthSchema } from "@/lib/validation/calendar-history";
import { successResponse } from "@/lib/validation/api-response";
import { AppError } from "@/server/errors/app-error";
import { handleApiError } from "@/server/errors/api-error-handler";
import { requireGuildApiUser, validateGuildId } from "@/server/guild/guild-route";
import { getGuildMemberCalendarProjection } from "@/server/services/guild-projection-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> },
) {
  try {
    const month = calendarMonthSchema.safeParse(
      request.nextUrl.searchParams.get("month"),
    );
    if (!month.success) throw new AppError("VALIDATION_ERROR");
    const user = await requireGuildApiUser();
    const { memberId } = await params;
    return successResponse(
      await getGuildMemberCalendarProjection(
        user.id,
        validateGuildId(memberId),
        month.data,
      ),
    );
  } catch (error) {
    return handleApiError(error);
  }
}
