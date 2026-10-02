import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { validateSessionToken, type AuthenticatedOwner } from "./auth-service";
import { SESSION_COOKIE_NAME } from "./session-token";

export async function getAuthenticatedUser(): Promise<AuthenticatedOwner | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  return validateSessionToken(token);
}

export async function requireAuthenticatedUser(): Promise<AuthenticatedOwner> {
  const owner = await getAuthenticatedUser();
  if (!owner) {
    redirect("/login");
  }
  return owner;
}

// Keep existing route/UI contracts without mass-renaming their local variables.
export const getCurrentOwner = getAuthenticatedUser;
export const requirePageOwner = requireAuthenticatedUser;
