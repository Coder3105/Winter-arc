"use client";

import Link from "next/link";
import { useState } from "react";

import { redirectExpiredSession } from "@/lib/auth/client-session";
import type { NotificationList } from "@/server/services/notification-service";

export function NotificationCenter({ initial }: { readonly initial: NotificationList }) {
  const [items, setItems] = useState(initial.notifications);
  const [unreadCount, setUnreadCount] = useState(initial.unreadCount);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function mutate(path: string, method: "PATCH" | "POST") {
    setError(null);
    const response = await fetch(path, { method });
    if (redirectExpiredSession(response)) throw new Error("Session expired.");
    const payload = await response.json();
    if (!response.ok || !payload.success) throw new Error("Notification update failed.");
    return payload.data;
  }

  async function markRead(id: string) {
    setBusy(id);
    try {
      const updated = await mutate(`/api/v1/notifications/${id}/read`, "PATCH");
      setItems((current) =>
        current.map((item) => (item.id === id ? { ...item, ...updated } : item)),
      );
      setUnreadCount((value) => Math.max(value - 1, 0));
    } catch {
      setError("THE NOTIFICATION COULD NOT BE UPDATED.");
    } finally {
      setBusy(null);
    }
  }

  async function markAllRead() {
    setBusy("all");
    try {
      await mutate("/api/v1/notifications/read-all", "POST");
      setItems((current) => current.map((item) => ({ ...item, status: "READ" })));
      setUnreadCount(0);
    } catch {
      setError("NOTIFICATIONS COULD NOT BE UPDATED.");
    } finally {
      setBusy(null);
    }
  }

  async function dismiss(id: string) {
    setBusy(id);
    try {
      await mutate(`/api/v1/notifications/${id}/dismiss`, "PATCH");
      const removed = items.find((item) => item.id === id);
      setItems((current) => current.filter((item) => item.id !== id));
      if (removed?.status === "UNREAD") setUnreadCount((value) => Math.max(value - 1, 0));
    } catch {
      setError("THE NOTIFICATION COULD NOT BE DISMISSED.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="notification-center" aria-live="polite">
      <div className="notification-center__toolbar">
        <span>{unreadCount} UNREAD</span>
        <button
          className="text-button"
          type="button"
          disabled={busy !== null || unreadCount === 0}
          onClick={() => void markAllRead()}
        >
          MARK ALL READ
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
      {items.length ? (
        <div className="notification-list">
          {items.map((item) => (
            <article
              key={item.id}
              className={`notification-card notification-card--${item.status.toLowerCase()} notification-card--${item.priority.toLowerCase()}`}
            >
              <div>
                <span>{item.type.replaceAll("_", " ")}</span>
                <time dateTime={item.generatedAt}>
                  {new Date(item.generatedAt).toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </time>
              </div>
              <h2>{item.title}</h2>
              <p>{item.body}</p>
              <footer>
                {item.status === "UNREAD" && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void markRead(item.id)}
                  >
                    MARK READ
                  </button>
                )}
                <Link href={item.actionRoute}>OPEN →</Link>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void dismiss(item.id)}
                >
                  DISMISS
                </button>
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <div className="notification-empty">
          <strong>NO SYSTEM NOTIFICATIONS</strong>
          <p>YOUR ACTIVE REMINDERS AND SYSTEM EVENTS WILL APPEAR HERE.</p>
        </div>
      )}
    </section>
  );
}
