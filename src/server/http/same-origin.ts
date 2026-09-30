import "server-only";

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

  if (suppliedOrigin !== new URL(request.url).origin) throw new AppError("FORBIDDEN");
}
