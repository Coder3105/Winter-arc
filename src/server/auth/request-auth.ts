import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { validateSessionToken, type AuthenticatedOwner } from "./auth-service";
import { SESSION_COOKIE_NAME } from "./session-token";

export async function getCurrentOwner(): Promise<AuthenticatedOwner | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  return validateSessionToken(token);
}

export async function requirePageOwner(): Promise<AuthenticatedOwner> {
  const owner = await getCurrentOwner();
  if (!owner) {
    redirect("/login");
  }
  return owner;
}
