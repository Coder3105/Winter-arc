import "server-only";

import { getServerEnvironment } from "@/lib/env/server";

const vapidKeyPattern = /^[A-Za-z0-9_-]+$/;

function decodedLength(value: string) {
  try {
    return Buffer.from(value, "base64url").length;
  } catch {
    return 0;
  }
}

export interface WebPushConfiguration {
  readonly publicKey: string;
  readonly privateKey: string;
  readonly subject: string;
}

type WebPushEnvironment = Pick<
  ReturnType<typeof getServerEnvironment>,
  "WEB_PUSH_VAPID_PUBLIC_KEY" | "WEB_PUSH_VAPID_PRIVATE_KEY" | "WEB_PUSH_SUBJECT"
>;

export function parseWebPushConfiguration(
  environment: WebPushEnvironment,
): WebPushConfiguration | null {
  const publicKey = environment.WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = environment.WEB_PUSH_VAPID_PRIVATE_KEY;
  const subject = environment.WEB_PUSH_SUBJECT;
  if (!publicKey || !privateKey || !subject) return null;
  if (!vapidKeyPattern.test(publicKey) || !vapidKeyPattern.test(privateKey)) return null;
  if (decodedLength(publicKey) !== 65 || decodedLength(privateKey) !== 32) return null;
  if (!subject.startsWith("mailto:") && !subject.startsWith("https://")) return null;
  return { publicKey, privateKey, subject };
}

export function getWebPushConfiguration(): WebPushConfiguration | null {
  return parseWebPushConfiguration(getServerEnvironment());
}
