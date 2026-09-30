import { bodyCompositionInputSchema } from "@/lib/validation/body-composition";
import { failureResponse, successResponse } from "@/lib/validation/api-response";
import { getApiOwner } from "@/server/auth/api-auth";
import { handleApiError } from "@/server/errors/api-error-handler";
import { readValidatedJson } from "@/server/http/validate-request";
import {
  createBodyCompositionAssessment,
  listBodyCompositionAssessments,
} from "@/server/services/body-composition-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const owner = await getApiOwner();
    if (!owner) {
      return failureResponse("UNAUTHORIZED", "Authentication is required.", 401);
    }
    return successResponse({
      assessments: await listBodyCompositionAssessments(owner.id),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const owner = await getApiOwner();
    if (!owner) {
      return failureResponse("UNAUTHORIZED", "Authentication is required.", 401);
    }
    const input = await readValidatedJson(request, bodyCompositionInputSchema);
    return successResponse(
      { assessment: await createBodyCompositionAssessment(owner.id, input) },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
