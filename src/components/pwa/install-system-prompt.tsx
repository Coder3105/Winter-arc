"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { useInstallSystem } from "./use-install-system";

export function InstallInstructionsDialog({
  open,
  onClose,
  onComplete,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onComplete: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
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
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, [open]);

  if (!open) return null;
  return (
    <dialog
      ref={dialog}
      className="install-instructions"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
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
    >
      <button
        className="install-instructions__close"
        type="button"
        aria-label="Close install instructions"
        onClick={onClose}
      >
        ×
      </button>
      <p className="install-instructions__eyebrow">SYSTEM // MANUAL INSTALL</p>
      <h2 ref={title} tabIndex={-1} id={`${id}-title`}>
        INSTALL SYSTEM
      </h2>
      <p id={`${id}-description`}>
        Add Winter Arc from your browser menu. Button names can vary by browser.
      </p>
      <ol>
        <li>Tap the browser Share or menu button.</li>
        <li>Choose &ldquo;Add to Home Screen&rdquo;.</li>
        <li>Confirm &ldquo;Add&rdquo;, then launch Winter Arc from its icon.</li>
      </ol>
      <div className="install-instructions__actions">
        <button type="button" className="system-button" onClick={onComplete}>
          GOT IT
        </button>
        <Link href="/install" className="secondary-button" onClick={onClose}>
          VIEW INSTALL GUIDE
        </Link>
      </div>
    </dialog>
  );
}

export function InstallSystemPrompt() {
  const pathname = usePathname();
  const install = useInstallSystem();
  const installButton = useRef<HTMLButtonElement>(null);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [formActive, setFormActive] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const clearTransientUi = () => {
      setInstructionsOpen(false);
      setMessage(null);
    };
    const clearWhenStandalone = () => {
      if (displayMode.matches) clearTransientUi();
    };
    window.addEventListener("appinstalled", clearTransientUi);
    displayMode.addEventListener("change", clearWhenStandalone);
    return () => {
      window.removeEventListener("appinstalled", clearTransientUi);
      displayMode.removeEventListener("change", clearWhenStandalone);
    };
  }, []);

  useEffect(() => {
    const navigation = document.querySelector<HTMLElement>("[data-mobile-navigation]");
    const updateOffset = () => {
      const height = navigation?.getBoundingClientRect().height ?? 0;
      document.documentElement.style.setProperty(
        "--mobile-navigation-height",
        `${Math.max(0, height)}px`,
      );
    };
    updateOffset();
    const observer =
      navigation && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(updateOffset)
        : null;
    if (navigation) observer?.observe(navigation);
    return () => {
      observer?.disconnect();
      document.documentElement.style.removeProperty("--mobile-navigation-height");
    };
  }, []);

  useEffect(() => {
    let frame = 0;
    const check = () => {
      const target = document.activeElement;
      setFormActive(
        target instanceof HTMLElement &&
          Boolean(target.closest("input, textarea, select, [contenteditable='true']")),
      );
    };
    const deferCheck = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(check);
    };
    document.addEventListener("focusin", check);
    document.addEventListener("focusout", deferCheck);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("focusin", check);
      document.removeEventListener("focusout", deferCheck);
    };
  }, []);

  const showPanel = pathname !== "/install" && install.shouldShowPrompt && !formActive;
  if (!showPanel && !instructionsOpen) return null;

  async function beginInstall() {
    setMessage(null);
    if (install.isIos) {
      setInstructionsOpen(true);
      return;
    }
    if (install.canNativePrompt) {
      const outcome = await install.promptInstall();
      if (outcome === "unavailable") {
        setMessage("Browser install is unavailable. Open the install guide.");
      }
      return;
    }
    setMessage("Browser install is unavailable. Open the install guide.");
  }

  return (
    <>
      {showPanel ? (
        <aside
          className="install-system-prompt"
          aria-labelledby="install-system-prompt-title"
        >
          <button
            className="install-system-prompt__close"
            type="button"
            aria-label="Dismiss Install System prompt"
            onClick={install.dismiss}
          >
            ×
          </button>
          <p>SYSTEM ACCESS</p>
          <strong id="install-system-prompt-title">INSTALL WINTER ARC</strong>
          <span>Run the System as a standalone app.</span>
          {message ? <small role="status">{message}</small> : null}
          <div>
            <button
              ref={installButton}
              className="system-button"
              type="button"
              onClick={() => void beginInstall()}
            >
              INSTALL SYSTEM
            </button>
            <button className="secondary-button" type="button" onClick={install.dismiss}>
              NOT NOW
            </button>
            <Link href="/install">VIEW GUIDE</Link>
          </div>
        </aside>
      ) : null}
      <InstallInstructionsDialog
        open={instructionsOpen}
        onClose={() => {
          setInstructionsOpen(false);
          installButton.current?.focus();
        }}
        onComplete={() => {
          install.dismiss();
          setInstructionsOpen(false);
        }}
      />
    </>
  );
}
