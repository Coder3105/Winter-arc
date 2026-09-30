"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { isIos, isStandalone } from "@/lib/pwa/push-client";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const subscribeToStaticCapability = () => () => undefined;

export function InstallGuide() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const standalone = useSyncExternalStore(
    subscribeToStaticCapability,
    isStandalone,
    () => false,
  );
  const ios = useSyncExternalStore(subscribeToStaticCapability, isIos, () => false);
  const [installedByEvent, setInstalledByEvent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const capture = (event: Event) => {
      event.preventDefault();
      setPrompt(event as BeforeInstallPromptEvent);
    };
    const complete = () => {
      setInstalledByEvent(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", complete);
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", complete);
    };
  }, []);

  const installed = standalone || installedByEvent;

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    setMessage(
      choice.outcome === "accepted" ? "INSTALL ACCEPTED." : "INSTALL DISMISSED.",
    );
    setPrompt(null);
  }

  return (
    <div className="install-guide">
      <div className="install-state">
        <span>INSTALL STATE</span>
        <strong>{installed ? "INSTALLED" : "BROWSER MODE"}</strong>
      </div>
      {installed ? (
        <p>Winter Arc is running in standalone app mode.</p>
      ) : ios ? (
        <ol>
          <li>Open this secure site in Safari.</li>
          <li>Tap the Share button.</li>
          <li>Select Add to Home Screen, then Add.</li>
          <li>Open Winter Arc from its Home Screen icon before enabling push.</li>
        </ol>
      ) : prompt ? (
        <button className="primary-button" type="button" onClick={() => void install()}>
          INSTALL WINTER ARC
        </button>
      ) : (
        <p>
          Use your browser&apos;s install-app menu when available. Installation requires a
          secure supported browser.
        </p>
      )}
      {message && <p aria-live="polite">{message}</p>}
      <p className="install-privacy">
        Private health and habit data is never saved in the offline cache.
      </p>
    </div>
  );
}
