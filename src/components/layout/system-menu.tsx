"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { LogoutButton } from "@/components/auth/logout-button";
import { ShadowPortrait } from "@/components/system/shadow-portrait";

const DESTINATIONS = [
  ["TODAY", "/today", "Daily quests"],
  ["CALENDAR", "/calendar", "Streaks & records"],
  ["WORKOUTS", "/workouts", "Weekly mission"],
  ["PROGRESS", "/progress", "Transformation"],
  ["REPORTS", "/reports", "Weekly reports"],
  ["PROFILE", "/profile", "Player profile"],
  ["STATUS", "/status", "Level & rank"],
  ["ACHIEVEMENTS", "/achievements", "Titles & milestones"],
  ["REWARDS", "/rewards", "Reward vault"],
  ["CONFIGURATION", "/setup", "System settings"],
] as const;

export function SystemMenu({
  displayName,
  active,
}: {
  readonly displayName: string;
  readonly active?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);
  function close() {
    dialog.current?.close();
  }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="system-menu-toggle"
        aria-label={open ? "Close System menu" : "Open System menu"}
        aria-expanded={open}
        aria-controls={id}
        aria-haspopup="dialog"
        onClick={() => {
          if (open) close();
          else {
            dialog.current?.showModal();
            setOpen(true);
          }
        }}
      >
        <span />
        <span />
        <span />
      </button>
      <dialog
        id={id}
        ref={dialog}
        className="system-drawer"
        aria-labelledby={`${id}-title`}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const controls = [
            ...event.currentTarget.querySelectorAll<HTMLElement>(
              "a[href], button:not(:disabled)",
            ),
          ];
          const first = controls[0];
          const last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
        onClose={() => {
          setOpen(false);
          trigger.current?.focus();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div className="system-drawer__body">
          <div className="system-drawer__heading">
            <div>
              <small>WINTER ARC</small>
              <h2 id={`${id}-title`}>SYSTEM MENU</h2>
            </div>
            <button
              className="system-drawer__close"
              type="button"
              onClick={close}
              aria-label="Close System menu"
            >
              ×
            </button>
          </div>
          <Link href="/profile" className="system-drawer__identity" onClick={close}>
            <ShadowPortrait soldier="beru" size={56} />
            <span>
              <small>PLAYER</small>
              <strong>{displayName}</strong>
            </span>
            <b aria-hidden="true">↗</b>
          </Link>
          <nav aria-label="Primary navigation">
            {DESTINATIONS.map(([key, href, description], index) => (
              <Link
                key={href}
                href={href}
                aria-current={active === key ? "page" : undefined}
                onClick={close}
              >
                <span className="system-drawer__index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>
                  <strong>{key}</strong>
                  <small>{description}</small>
                </span>
                <b aria-hidden="true">›</b>
              </Link>
            ))}
          </nav>
          <footer>
            <span className="system-drawer__session">PRIVATE SESSION // CONNECTED</span>
            <LogoutButton />
          </footer>
        </div>
      </dialog>
    </>
  );
}
