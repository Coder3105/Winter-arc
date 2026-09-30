import "server-only";

import type { ZodType } from "zod";

import { AppError } from "@/server/errors/app-error";

export async function readValidatedJson<T>(
  request: Request,
  schema: ZodType<T>,
  options?: { readonly maxBytes?: number },
): Promise<T> {
  let body: unknown;
  try {
    if (options?.maxBytes) {
      const declaredLength = Number(request.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > options.maxBytes) {
        throw new Error("Request body is too large.");
      }
      const text = await request.text();
      if (new TextEncoder().encode(text).byteLength > options.maxBytes) {
        throw new Error("Request body is too large.");
      }
      body = JSON.parse(text);
    } else {
      body = await request.json();
    }
  } catch {
    throw new AppError("VALIDATION_ERROR");
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    throw new AppError("VALIDATION_ERROR");
  }
  return result.data;
}
