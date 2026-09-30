import type { NextRequest } from "next/server";

import { failureResponse, successResponse } from "@/lib/validation/api-response";
import { workoutInputSchema } from "@/lib/validation/workout";
import { parseCalendarDate } from "@/lib/utils/calendar-date";
import { getApiOwner } from "@/server/auth/api-auth";
import { handleApiError } from "@/server/errors/api-error-handler";
import { AppError } from "@/server/errors/app-error";
import { readValidatedJson } from "@/server/http/validate-request";
import {
  createTodayWorkout,
  getCurrentWorkoutDashboard,
  getWorkoutsByDate,
} from "@/server/services/workout-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const privateResponse = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  try {
    const owner = await getApiOwner();
    if (!owner)
      return failureResponse("UNAUTHORIZED", "Authentication is required.", 401);
    const date = request.nextUrl.searchParams.get("date");
    if (!date) throw new AppError("VALIDATION_ERROR");
    try {
      parseCalendarDate(date);
    } catch {
      throw new AppError("VALIDATION_ERROR");
    }
    return successResponse(await getWorkoutsByDate(owner.id, date), {
      status: 200,
      headers: privateResponse,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const owner = await getApiOwner();
    if (!owner)
      return failureResponse("UNAUTHORIZED", "Authentication is required.", 401);
    const input = await readValidatedJson(request, workoutInputSchema);
    const workout = await createTodayWorkout(owner.id, input);
    return successResponse(
      {
        workout,
        dashboard: await getCurrentWorkoutDashboard(owner.id),
      },
      { status: 201, headers: privateResponse },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
