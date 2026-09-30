import { AuthenticatedHeader } from "@/components/layout/authenticated-header";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { requirePageOwner } from "@/server/auth/request-auth";
import { getNotifications } from "@/server/services/notification-service";

export default async function NotificationsPage() {
  const owner = await requirePageOwner();
  const notifications = await getNotifications(owner.id, { limit: 30 });
  return (
    <main className="app-shell">
      <div className="app-frame app-frame--wide">
        <AuthenticatedHeader displayName={owner.displayName} section="NOTIFICATIONS" />
        <div className="page-heading">
          <p>SYSTEM // IN-APP DELIVERY</p>
          <h1>NOTIFICATIONS</h1>
        </div>
        <NotificationCenter initial={notifications} />
      </div>
    </main>
  );
}
