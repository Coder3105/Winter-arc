import { failureResponse, successResponse } from "@/lib/validation/api-response";
import { weightInputSchema } from "@/lib/validation/weight";
import { getApiOwner } from "@/server/auth/api-auth";
import { handleApiError } from "@/server/errors/api-error-handler";
import { readValidatedJson } from "@/server/http/validate-request";
import {
  deleteTodayWeight,
  getTodayWeight,
  upsertTodayWeight,
} from "@/server/services/weight-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const privateResponse = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const owner = await getApiOwner();
    if (!owner)
      return failureResponse("UNAUTHORIZED", "Authentication is required.", 401);
    return successResponse(await getTodayWeight(owner.id), {
      status: 200,
      headers: privateResponse,
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
    const input = await readValidatedJson(request, weightInputSchema);
    return successResponse(await upsertTodayWeight(owner.id, input), {
      status: 200,
      headers: privateResponse,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE() {
  try {
    const owner = await getApiOwner();
    if (!owner)
      return failureResponse("UNAUTHORIZED", "Authentication is required.", 401);
    return successResponse(await deleteTodayWeight(owner.id), {
      status: 200,
      headers: privateResponse,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
