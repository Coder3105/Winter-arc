import {
  pushSubscriptionInputSchema,
  pushUnsubscribeInputSchema,
} from "@/lib/validation/push-subscription";
import { failureResponse, successResponse } from "@/lib/validation/api-response";
import { getApiOwner } from "@/server/auth/api-auth";
import { handleApiError } from "@/server/errors/api-error-handler";
import { assertSameOriginRequest } from "@/server/http/same-origin";
import { readValidatedJson } from "@/server/http/validate-request";
import {
  registerPushSubscription,
  unsubscribePushSubscription,
} from "@/server/services/push-subscription-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const owner = await getApiOwner();
    if (!owner)
      return failureResponse("UNAUTHORIZED", "Authentication is required.", 401);
    assertSameOriginRequest(request);
    const input = await readValidatedJson(request, pushSubscriptionInputSchema, {
      maxBytes: 12_000,
    });
    return successResponse(await registerPushSubscription(owner.id, input), {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const owner = await getApiOwner();
    if (!owner)
      return failureResponse("UNAUTHORIZED", "Authentication is required.", 401);
    assertSameOriginRequest(request);
    const { endpoint } = await readValidatedJson(request, pushUnsubscribeInputSchema, {
      maxBytes: 4_096,
    });
    return successResponse(await unsubscribePushSubscription(owner.id, endpoint), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
