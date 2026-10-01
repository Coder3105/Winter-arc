"use client";

import { useEffect, useId, useRef, useState } from "react";

export function UpdateDialog({
  offline,
  onUpdate,
  onLater,
}: {
  readonly offline: boolean;
  readonly onUpdate: () => void;
  readonly onLater: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const id = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const modal = dialog.current;
    if (!modal) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    modal.showModal();
    document.body.style.overflow = "hidden";
    title.current?.focus();
    return () => {
      modal.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => {
      setPending(false);
      setError(
        "The update is taking longer than expected. Retry or return to the System.",
      );
    }, 15000);
    return () => window.clearTimeout(timer);
  }, [pending]);

  function update() {
    if (pending || offline) return;
    setError(null);
    setPending(true);
    try {
      onUpdate();
    } catch {
      setPending(false);
      setError("Could not start the update. Please try again.");
    }
  }

  return (
    <dialog
      ref={dialog}
      className="system-update-dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      aria-modal="true"
      data-offline-allowed
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onLater();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = [
          ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
            "button:not(:disabled)",
          ),
        ];
        const first = controls[0];
        const last = controls.at(-1);
        if (!first) {
          event.preventDefault();
          return;
        }
        if (!controls.includes(document.activeElement as HTMLButtonElement)) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <div className="system-update-dialog__mark" aria-hidden="true">
        ↑
      </div>
      <p className="system-update-dialog__eyebrow">SYSTEM // VERSION READY</p>
      <h2 ref={title} tabIndex={-1} id={`${id}-title`}>
        SYSTEM UPDATE AVAILABLE
      </h2>
      <p id={`${id}-description`}>
        A new version of Winter Arc is ready. Update to load the latest System.
      </p>
      <p className="system-update-dialog__notice">
        Updating reloads the app. Choose Later to save any unfinished entries first.
      </p>
      {offline && (
        <p role="status">
          Reconnect to install the update. You can return to the System meanwhile.
        </p>
      )}
      {error && (
        <p className="system-update-dialog__error" role="alert">
          {error}
        </p>
      )}
      {pending && (
        <p className="system-update-dialog__pending" role="status">
          <span aria-hidden="true" />
          UPDATING SYSTEM…
        </p>
      )}
      <div className="system-update-dialog__actions" aria-busy={pending}>
        <button
          type="button"
          onClick={update}
          disabled={pending || offline}
          data-offline-allowed
        >
          {pending ? "UPDATING…" : error ? "RETRY UPDATE" : "UPDATE NOW"}
        </button>
        <button type="button" onClick={onLater} disabled={pending} data-offline-allowed>
          LATER
        </button>
      </div>
    </dialog>
  );
}
