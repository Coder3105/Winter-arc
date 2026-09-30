"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import {
  disableDevicePush,
  enableDevicePush,
  isIos,
  isStandalone,
  supportsWebPush,
  type PushStatus,
} from "@/lib/pwa/push-client";

export function DevicePushSettings({
  initialStatus,
}: {
  readonly initialStatus: PushStatus;
}) {
  const [status, setStatus] = useState(initialStatus);
  const supported = useSyncExternalStore(
    () => () => undefined,
    supportsWebPush,
    () => false,
  );
  const ios = useSyncExternalStore(
    () => () => undefined,
    isIos,
    () => false,
  );
  const standalone = useSyncExternalStore(
    () => () => undefined,
    isStandalone,
    () => false,
  );
  const browserPermission = useSyncExternalStore(
    () => () => undefined,
    () => (supportsWebPush() ? Notification.permission : "unsupported"),
    () => "unsupported" as const,
  );
  const [permissionOverride, setPermissionOverride] = useState<
    NotificationPermission | "unsupported" | null
  >(null);
  const [deviceSubscribed, setDeviceSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const permission = permissionOverride ?? browserPermission;
  const needsIosInstall = supported && ios && !standalone;

  useEffect(() => {
    if (!supported) return;
    let active = true;
    void navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (active) setDeviceSubscribed(Boolean(subscription));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [supported]);

  async function change(enable: boolean) {
    setBusy(true);
    setMessage(null);
    try {
      const next = enable ? await enableDevicePush(status) : await disableDevicePush();
      setStatus(next);
      setDeviceSubscribed(enable);
      setPermissionOverride(Notification.permission);
      setMessage(enable ? "DEVICE PUSH ENABLED." : "THIS DEVICE WAS UNSUBSCRIBED.");
    } catch (error) {
      setPermissionOverride(supported ? Notification.permission : "unsupported");
      setMessage(error instanceof Error ? error.message : "DEVICE PUSH UPDATE FAILED.");
    } finally {
      setBusy(false);
    }
  }

  const enabled = deviceSubscribed;
  return (
    <div className="device-push-settings">
      <dl className="detail-list">
        <div>
          <dt>SERVER TRANSPORT</dt>
          <dd>{status.configured ? "CONFIGURED" : "NOT CONFIGURED"}</dd>
        </div>
        <div>
          <dt>THIS BROWSER</dt>
          <dd>{supported ? "SUPPORTED" : "UNSUPPORTED"}</dd>
        </div>
        <div>
          <dt>INSTALL STATE</dt>
          <dd>{standalone ? "INSTALLED" : "NOT INSTALLED"}</dd>
        </div>
        <div>
          <dt>PERMISSION</dt>
          <dd>{permission.toUpperCase()}</dd>
        </div>
        <div>
          <dt>THIS DEVICE</dt>
          <dd>{deviceSubscribed ? "SUBSCRIBED" : "NOT SUBSCRIBED"}</dd>
        </div>
        <div>
          <dt>ACTIVE DEVICES</dt>
          <dd>{status.activeSubscriptionCount}</dd>
        </div>
      </dl>
      {needsIosInstall && (
        <p>Install Winter Arc from Safari to the Home Screen before enabling push.</p>
      )}
      {permission === "denied" && (
        <p>
          Notifications are blocked by the browser. Change permission in system settings.
        </p>
      )}
      {!status.configured && (
        <p>
          VAPID configuration is required on the server before a device can subscribe.
        </p>
      )}
      <button
        className="primary-button"
        type="button"
        disabled={
          busy ||
          !supported ||
          !status.configured ||
          needsIosInstall ||
          (!enabled && permission === "denied")
        }
        onClick={() => void change(!enabled)}
      >
        {busy ? "UPDATING…" : enabled ? "UNSUBSCRIBE THIS DEVICE" : "ENABLE DEVICE PUSH"}
      </button>
      <p>
        Device delivery is separate from reminder timing. Unsubscribing does not change
        the Phase 11 reminder protocol.
      </p>
      {message && <p className="notification-settings__status">{message}</p>}
    </div>
  );
}
