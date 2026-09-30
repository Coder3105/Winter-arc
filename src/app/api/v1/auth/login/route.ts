import { cookies } from "next/headers";

import { loginSchema } from "@/lib/validation/auth";
import { failureResponse, successResponse } from "@/lib/validation/api-response";
import { authenticateOwner, createSession } from "@/server/auth/auth-service";
import {
  getSessionCookieOptions,
  SESSION_COOKIE_NAME,
} from "@/server/auth/session-token";
import { handleApiError } from "@/server/errors/api-error-handler";
import { readValidatedJson } from "@/server/http/validate-request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = await readValidatedJson(request, loginSchema);
    const owner = await authenticateOwner(input.email, input.password);

    if (!owner) {
      return failureResponse("UNAUTHORIZED", "Invalid email or password.", 401);
    }

    const userAgent = request.headers.get("user-agent")?.slice(0, 500) ?? null;
    const session = await createSession(owner.id, userAgent);
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, session.token, getSessionCookieOptions());

    return successResponse({ owner });
  } catch (error) {
    return handleApiError(error);
  }
}
