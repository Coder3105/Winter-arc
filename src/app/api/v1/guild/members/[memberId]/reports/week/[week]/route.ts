import { successResponse } from "@/lib/validation/api-response";
import { AppError } from "@/server/errors/app-error";
import { handleApiError } from "@/server/errors/api-error-handler";
import { requireGuildApiUser, validateGuildId } from "@/server/guild/guild-route";
import { getGuildMemberReportProjection } from "@/server/services/guild-projection-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ memberId: string; week: string }> },
) {
  try {
    const user = await requireGuildApiUser();
    const { memberId, week } = await params;
    if (!/^\d+$/.test(week)) throw new AppError("VALIDATION_ERROR");
    return successResponse(
      await getGuildMemberReportProjection(
        user.id,
        validateGuildId(memberId),
        Number(week),
      ),
    );
  } catch (error) {
    return handleApiError(error);
  }
}
