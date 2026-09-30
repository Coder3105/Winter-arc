import { redirectExpiredSession } from "@/lib/auth/client-session";

export interface PushStatus {
  readonly configured: boolean;
  readonly vapidPublicKey: string | null;
  readonly activeSubscriptionCount: number;
  readonly hasActiveSubscription: boolean;
}

export function supportsWebPush() {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      (navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

export function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function urlBase64ToBytes(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob((value + padding).replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function fetchPushStatus(): Promise<PushStatus> {
  const response = await fetch("/api/v1/push/status", { cache: "no-store" });
  if (redirectExpiredSession(response)) throw new Error("Session expired.");
  const payload = await response.json();
  if (!response.ok || !payload.success) throw new Error("Push status unavailable.");
  return payload.data as PushStatus;
}

export async function enableDevicePush(status: PushStatus) {
  if (!supportsWebPush() || !status.configured || !status.vapidPublicKey) {
    throw new Error("Push is unavailable on this device.");
  }
  if (isIos() && !isStandalone()) {
    throw new Error("Install Winter Arc on the Home Screen before enabling push.");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error("Notification permission was not granted.");
  const registration = await navigator.serviceWorker.ready;
  const current = await registration.pushManager.getSubscription();
  const subscription =
    current ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToBytes(status.vapidPublicKey),
    }));
  const serialized = subscription.toJSON();
  const response = await fetch("/api/v1/push/subscriptions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(serialized),
  });
  if (redirectExpiredSession(response)) throw new Error("Session expired.");
  const payload = await response.json();
  if (!response.ok || !payload.success)
    throw new Error("Subscription registration failed.");
  return payload.data as PushStatus;
}

export async function disableDevicePush() {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return fetchPushStatus();
  const response = await fetch("/api/v1/push/subscriptions", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  if (redirectExpiredSession(response)) throw new Error("Session expired.");
  const payload = await response.json();
  if (!response.ok || !payload.success) throw new Error("Unsubscribe failed.");
  await subscription.unsubscribe();
  return fetchPushStatus();
}
