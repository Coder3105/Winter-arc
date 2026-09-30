"use client";

import Link from "next/link";
import { useEffect } from "react";

export interface SystemEventData {
  readonly id: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly detail: string;
  readonly accent?: "STANDARD" | "ADVANCEMENT" | "ACHIEVEMENT";
  readonly actionHref?: string;
  readonly actionLabel?: string;
}

export function SystemEvent({
  event,
  onDismiss,
}: {
  readonly event: SystemEventData | null;
  readonly onDismiss: () => void;
}) {
  useEffect(() => {
    if (!event) return;
    const timeout = window.setTimeout(onDismiss, 3600);
    return () => window.clearTimeout(timeout);
  }, [event, onDismiss]);

  if (!event) return null;

  return (
    <aside
      className={`system-event system-event--${(event.accent ?? "STANDARD").toLowerCase()}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <button type="button" onClick={onDismiss} aria-label="Dismiss System event">
        ×
      </button>
      <span>{event.eyebrow}</span>
      <strong>{event.title}</strong>
      <p>{event.detail}</p>
      {event.actionHref && event.actionLabel && (
        <Link href={event.actionHref}>{event.actionLabel} →</Link>
      )}
    </aside>
  );
}
