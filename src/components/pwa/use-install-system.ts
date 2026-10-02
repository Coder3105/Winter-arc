"use client";

import { useEffect, useSyncExternalStore } from "react";

import { installSystemController } from "@/lib/pwa/install-system";

export function useInstallSystem() {
  const snapshot = useSyncExternalStore(
    installSystemController.subscribe,
    installSystemController.getSnapshot,
    installSystemController.getServerSnapshot,
  );
  useEffect(() => installSystemController.start(), []);
  return {
    ...snapshot,
    dismiss: () => installSystemController.dismiss(),
    promptInstall: () => installSystemController.promptInstall(),
  };
}
