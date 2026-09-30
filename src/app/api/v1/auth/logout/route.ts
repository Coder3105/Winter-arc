import { cookies } from "next/headers";

import { successResponse } from "@/lib/validation/api-response";
import { revokeSession } from "@/server/auth/auth-service";
import {
  getSessionCookieOptions,
  SESSION_COOKIE_NAME,
} from "@/server/auth/session-token";
import { handleApiError } from "@/server/errors/api-error-handler";

export const runtime = "nodejs";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (token) {
      await revokeSession(token);
    }
    cookieStore.set(SESSION_COOKIE_NAME, "", {
      ...getSessionCookieOptions(),
      maxAge: 0,
      expires: new Date(0),
    });
    return successResponse({ loggedOut: true });
  } catch (error) {
    return handleApiError(error);
  }
}
