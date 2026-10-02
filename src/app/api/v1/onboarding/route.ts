import { onboardingDraftInputSchema } from "@/lib/validation/onboarding";
import { failureResponse, successResponse } from "@/lib/validation/api-response";
import { getApiOwner } from "@/server/auth/api-auth";
import {
  handleOnboardingError,
  readOnboardingInput,
} from "@/server/errors/onboarding-error-handler";
import {
  getOnboardingDraft,
  saveOnboardingDraft,
} from "@/server/services/onboarding-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const owner = await getApiOwner();
    if (!owner) {
      return failureResponse("UNAUTHORIZED", "Authentication is required.", 401);
    }
    return successResponse({ draft: await getOnboardingDraft(owner.id) });
  } catch (error) {
    return handleOnboardingError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const owner = await getApiOwner();
    if (!owner) {
      return failureResponse("UNAUTHORIZED", "Authentication is required.", 401);
    }
    const input = await readOnboardingInput(request, onboardingDraftInputSchema);
    return successResponse({ draft: await saveOnboardingDraft(owner.id, input) });
  } catch (error) {
    return handleOnboardingError(error);
  }
}
