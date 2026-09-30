import Link from "next/link";

import { AuthenticatedHeader } from "@/components/layout/authenticated-header";
import { NotificationSettings } from "@/components/notifications/notification-settings";
import { DevicePushSettings } from "@/components/notifications/device-push-settings";
import { SystemPanel } from "@/components/system/system-panel";
import { requirePageOwner } from "@/server/auth/request-auth";
import { getNotificationPreferences } from "@/server/services/notification-service";
import { getPushStatus } from "@/server/services/push-subscription-service";

export default async function NotificationSettingsPage() {
  const owner = await requirePageOwner();
  const [result, pushStatus] = await Promise.all([
    getNotificationPreferences(owner.id),
    getPushStatus(owner.id),
  ]);
  return (
    <main className="app-shell">
      <div className="app-frame app-frame--wide">
        <AuthenticatedHeader
          displayName={owner.displayName}
          section="NOTIFICATION PROTOCOL"
          active="PROFILE"
        />
        <div className="page-heading">
          <p>SYSTEM // OPT-IN REMINDERS</p>
          <h1>NOTIFICATION PROTOCOL</h1>
        </div>
        <SystemPanel eyebrow="PRIVATE // TIMEZONE AWARE" title="REMINDER SETTINGS">
          {result.kind === "AVAILABLE" ? (
            <NotificationSettings initial={result} />
          ) : (
            <div className="notification-empty">
              <strong>PROFILE SETUP REQUIRED</strong>
              <p>Complete the owner profile before configuring local-time reminders.</p>
              <Link className="primary-button" href="/setup">
                OPEN SETUP
              </Link>
            </div>
          )}
        </SystemPanel>
        <SystemPanel eyebrow="WEB PUSH // DEVICE" title="DEVICE PUSH">
          <DevicePushSettings initialStatus={pushStatus} />
        </SystemPanel>
      </div>
    </main>
  );
}
