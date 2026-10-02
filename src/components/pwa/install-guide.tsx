"use client";

import { useState } from "react";

import { useInstallSystem } from "./use-install-system";

export function InstallGuide() {
  const installSystem = useInstallSystem();
  const [message, setMessage] = useState<string | null>(null);

  async function install() {
    const choice = await installSystem.promptInstall();
    setMessage(
      choice === "accepted"
        ? "INSTALL ACCEPTED."
        : choice === "dismissed"
          ? "INSTALL DISMISSED."
          : "USE THE BROWSER INSTALL MENU WHEN AVAILABLE.",
    );
  }

  return (
    <div className="install-guide">
      <div className="install-state">
        <span>INSTALL STATE</span>
        <strong>
          {installSystem.isStandalone || installSystem.installedByEvent
            ? "INSTALLED"
            : "BROWSER MODE"}
        </strong>
      </div>
      {installSystem.isStandalone || installSystem.installedByEvent ? (
        <p>Winter Arc is running in standalone app mode.</p>
      ) : installSystem.isIos ? (
        <ol>
          <li>Open the browser Share or menu controls.</li>
          <li>Select Add to Home Screen, then Add.</li>
          <li>Open Winter Arc from its Home Screen icon before enabling push.</li>
        </ol>
      ) : installSystem.canNativePrompt ? (
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
