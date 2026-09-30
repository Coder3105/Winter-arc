import { failureResponse, successResponse } from "@/lib/validation/api-response";
import { workoutIdSchema } from "@/lib/validation/workout";
import { getApiOwner } from "@/server/auth/api-auth";
import { handleApiError } from "@/server/errors/api-error-handler";
import { AppError } from "@/server/errors/app-error";
import {
  deleteTodayWorkout,
  getCurrentWorkoutDashboard,
} from "@/server/services/workout-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { readonly params: Promise<{ readonly id: string }> },
) {
  try {
    const owner = await getApiOwner();
    if (!owner)
      return failureResponse("UNAUTHORIZED", "Authentication is required.", 401);
    const parsed = workoutIdSchema.safeParse((await params).id);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR");
    const workout = await deleteTodayWorkout(owner.id, parsed.data);
    return successResponse(
      {
        deletedWorkoutId: workout.id,
        dashboard: await getCurrentWorkoutDashboard(owner.id),
      },
      {
        status: 200,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
