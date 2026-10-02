import "server-only";

import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { OtpPurpose } from "./otp-policy";

interface OtpIdentity {
  readonly purpose: OtpPurpose;
  readonly requestId: string;
  readonly emailNormalized: string;
  readonly contextKey?: string | null;
}

function payload(identity: OtpIdentity, otp: string) {
  const legacy = [identity.purpose, identity.requestId, identity.emailNormalized];
  return [...legacy, ...(identity.contextKey ? [identity.contextKey] : []), otp].join(
    ":",
  );
}

export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function generateOtpRequestId(): string {
  return randomBytes(32).toString("base64url");
}

export function hashOtp(identity: OtpIdentity, otp: string, pepper: string): string {
  return createHmac("sha256", pepper).update(payload(identity, otp)).digest("hex");
}

export function verifyOtpHash(
  identity: OtpIdentity,
  otp: string,
  expectedHash: string,
  pepper: string,
): boolean {
  const actual = Buffer.from(hashOtp(identity, otp, pepper), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function opaqueSubjectHash(scope: string, value: string, pepper: string): string {
  return createHmac("sha256", pepper).update(`${scope}:${value}`).digest("hex");
}
