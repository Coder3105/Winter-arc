import type { NextRequest } from "next/server";

import { failureResponse, successResponse } from "@/lib/validation/api-response";
import { getApiOwner } from "@/server/auth/api-auth";
import { handleApiError } from "@/server/errors/api-error-handler";
import { AppError } from "@/server/errors/app-error";
import { getNotifications } from "@/server/services/notification-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const owner = await getApiOwner();
    if (!owner)
      return failureResponse("UNAUTHORIZED", "Authentication is required.", 401);
    const rawLimit = request.nextUrl.searchParams.get("limit") ?? "20";
    if (!/^\d+$/.test(rawLimit)) throw new AppError("VALIDATION_ERROR");
    const limit = Number(rawLimit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50)
      throw new AppError("VALIDATION_ERROR");
    const cursor = request.nextUrl.searchParams.get("cursor");
    return successResponse(
      await getNotifications(owner.id, {
        limit,
        ...(cursor === null ? {} : { cursor }),
      }),
      {
        status: 200,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
