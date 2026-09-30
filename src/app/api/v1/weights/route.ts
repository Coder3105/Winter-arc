import type { NextRequest } from "next/server";

import { failureResponse, successResponse } from "@/lib/validation/api-response";
import { weightHistoryRangeSchema } from "@/lib/validation/weight";
import { getApiOwner } from "@/server/auth/api-auth";
import { handleApiError } from "@/server/errors/api-error-handler";
import { AppError } from "@/server/errors/app-error";
import { getWeightHistory } from "@/server/services/weight-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const owner = await getApiOwner();
    if (!owner)
      return failureResponse("UNAUTHORIZED", "Authentication is required.", 401);
    const parsed = weightHistoryRangeSchema.safeParse({
      from: request.nextUrl.searchParams.get("from"),
      to: request.nextUrl.searchParams.get("to"),
    });
    if (!parsed.success) throw new AppError("VALIDATION_ERROR");
    return successResponse(
      await getWeightHistory(owner.id, parsed.data.from, parsed.data.to),
      {
        status: 200,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
