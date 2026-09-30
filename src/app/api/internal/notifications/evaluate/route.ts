import { failureResponse, successResponse } from "@/lib/validation/api-response";
import { getServerEnvironment } from "@/lib/env/server";
import { handleApiError } from "@/server/errors/api-error-handler";
import { matchesCronSecret } from "@/server/notifications/cron-authorization";
import { runNotificationScheduler } from "@/server/services/notification-scheduler-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer "))
      return failureResponse("UNAUTHORIZED", "Internal authorization failed.", 401);
    const secret = getServerEnvironment().CRON_SECRET;
    if (!secret)
      return failureResponse(
        "INTERNAL_ERROR",
        "Notification scheduling is not configured.",
        503,
      );
    if (!matchesCronSecret(authorization, secret))
      return failureResponse("UNAUTHORIZED", "Internal authorization failed.", 401);
    const result = await runNotificationScheduler();
    return successResponse(result, {
      status: 200,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
