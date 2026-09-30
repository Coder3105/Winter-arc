import Link from "next/link";

import { SystemMenu } from "./system-menu";
import { NotificationBell } from "@/components/notifications/notification-bell";

interface AuthenticatedHeaderProps {
  readonly displayName: string;
  readonly section: string;
  readonly active?:
    "TODAY" | "CALENDAR" | "WORKOUTS" | "PROGRESS" | "PROFILE" | "REPORTS";
}

export function AuthenticatedHeader({
  displayName,
  section,
  active,
}: AuthenticatedHeaderProps) {
  return (
    <header className="app-header">
      <Link className="app-header__brand" href="/">
        <span>WINTER ARC</span>
        <small>{section}</small>
      </Link>
      <div className="app-header__actions">
        <NotificationBell />
        <SystemMenu displayName={displayName} {...(active ? { active } : {})} />
      </div>
    </header>
  );
}
