import "server-only";

import { getConfiguredApplicationOrigin } from "@/lib/env/server";
import { AppError } from "@/server/errors/app-error";

export function assertSameOriginRequest(request: Request) {
  const supplied = request.headers.get("origin");
  if (!supplied) throw new AppError("FORBIDDEN");

  let suppliedOrigin: string;
  try {
    suppliedOrigin = new URL(supplied).origin;
  } catch {
    throw new AppError("FORBIDDEN");
  }

  const requestOrigin = new URL(request.url).origin;
  if (suppliedOrigin === requestOrigin) return;

  const configuredOrigin = getConfiguredApplicationOrigin();
  if (configuredOrigin && suppliedOrigin === configuredOrigin) return;

  throw new AppError("FORBIDDEN");
}
