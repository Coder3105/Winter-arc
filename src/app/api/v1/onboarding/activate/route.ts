import { onboardingActivationInputSchema } from "@/lib/validation/onboarding";
import { failureResponse, successResponse } from "@/lib/validation/api-response";
import { getApiOwner } from "@/server/auth/api-auth";
import {
  handleOnboardingError,
  readOnboardingInput,
} from "@/server/errors/onboarding-error-handler";
import { activateOnboarding } from "@/server/services/onboarding-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const owner = await getApiOwner();
    if (!owner) {
      return failureResponse("UNAUTHORIZED", "Authentication is required.", 401);
    }
    const input = await readOnboardingInput(request, onboardingActivationInputSchema);
    return successResponse(await activateOnboarding(owner.id, input));
  } catch (error) {
    return handleOnboardingError(error);
  }
}
