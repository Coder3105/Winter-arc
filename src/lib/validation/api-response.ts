import { NextResponse } from "next/server";

import type { AppErrorCode } from "@/server/errors/app-error";

export interface ApiSuccess<T> {
  readonly success: true;
  readonly data: T;
}

export interface ApiFailure {
  readonly success: false;
  readonly error: {
    readonly code: AppErrorCode;
    readonly message: string;
  };
}

export function successResponse<T>(
  data: T,
  init: ResponseInit = { status: 200 },
): NextResponse<ApiSuccess<T>> {
  const headers = new Headers(init.headers);
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "private, no-store");
  return NextResponse.json({ success: true, data }, { ...init, headers });
}

export function failureResponse(
  code: AppErrorCode,
  message: string,
  status: number,
): NextResponse<ApiFailure> {
  return NextResponse.json(
    {
      success: false,
      error: { code, message },
    },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}
