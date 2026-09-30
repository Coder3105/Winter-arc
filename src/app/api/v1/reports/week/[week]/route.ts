import { failureResponse, successResponse } from "@/lib/validation/api-response";
import { getApiOwner } from "@/server/auth/api-auth";
import { AppError } from "@/server/errors/app-error";
import { handleApiError } from "@/server/errors/api-error-handler";
import { getWeeklyReport } from "@/server/services/weekly-report-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ week: string }> },
) {
  try {
    const owner = await getApiOwner();
    if (!owner)
      return failureResponse("UNAUTHORIZED", "Authentication is required.", 401);
    const { week } = await params;
    if (!/^\d+$/.test(week)) throw new AppError("VALIDATION_ERROR");
    return successResponse(await getWeeklyReport(owner.id, Number(week)), {
      status: 200,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
