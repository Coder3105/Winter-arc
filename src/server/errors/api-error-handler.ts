import { failureResponse } from "@/lib/validation/api-response";

import { mapErrorToPublicError } from "./app-error";

export function handleApiError(error: unknown) {
  const publicError = mapErrorToPublicError(error);

  return failureResponse(publicError.code, publicError.message, publicError.status);
}
