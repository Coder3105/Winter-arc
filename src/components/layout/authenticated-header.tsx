import Link from "next/link";

import { LogoutButton } from "@/components/auth/logout-button";
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
      <nav aria-label="Primary navigation">
        <Link href="/today" aria-current={active === "TODAY" ? "page" : undefined}>
          TODAY
        </Link>
        <Link href="/calendar" aria-current={active === "CALENDAR" ? "page" : undefined}>
          CALENDAR
        </Link>
        <Link href="/workouts" aria-current={active === "WORKOUTS" ? "page" : undefined}>
          WORKOUTS
        </Link>
        <Link href="/progress" aria-current={active === "PROGRESS" ? "page" : undefined}>
          PROGRESS
        </Link>
        <Link href="/reports" aria-current={active === "REPORTS" ? "page" : undefined}>
          REPORTS
        </Link>
        <NotificationBell />
        <LogoutButton />
      </nav>
      <Link className="app-header__owner" href="/profile">
        OWNER // {displayName.toUpperCase()}
      </Link>
    </header>
  );
}
