"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { redirectExpiredSession } from "@/lib/auth/client-session";

export function NotificationBell() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/v1/notifications/unread-count", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => {
        if (redirectExpiredSession(response)) return null;
        return response.ok ? response.json() : null;
      })
      .then((payload) => {
        if (payload?.success) setCount(payload.data.unreadCount);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  return (
    <Link className="notification-bell" href="/notifications" aria-label="Notifications">
      <span aria-hidden="true">&#128276;</span>
      {count > 0 && <b>{count > 9 ? "9+" : count}</b>}
    </Link>
  );
}
