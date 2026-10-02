export const INSTALL_PROMPT_DISMISSAL_KEY = "winter-arc:install-prompt-dismissed-at";
export const INSTALL_PROMPT_COOLDOWN_DAYS = 7;
export const INSTALL_PROMPT_COOLDOWN_MS =
  INSTALL_PROMPT_COOLDOWN_DAYS * 24 * 60 * 60 * 1_000;

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ readonly outcome: "accepted" | "dismissed" }>;
}

interface InstallMediaQuery {
  readonly matches: boolean;
  addEventListener(type: "change", listener: () => void): void;
  removeEventListener(type: "change", listener: () => void): void;
}

export interface InstallSystemEnvironment {
  readonly eventTarget: Pick<Window, "addEventListener" | "removeEventListener">;
  readonly matchMedia: (query: string) => InstallMediaQuery;
  readonly navigator: Pick<Navigator, "userAgent" | "platform" | "maxTouchPoints"> & {
    readonly standalone?: boolean;
  };
  readonly storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  readonly now: () => number;
}

export interface InstallSystemSnapshot {
  readonly hydrated: boolean;
  readonly isStandalone: boolean;
  readonly isMobile: boolean;
  readonly isIos: boolean;
  readonly canNativePrompt: boolean;
  readonly dismissed: boolean;
  readonly nativePromptAccepted: boolean;
  readonly installedByEvent: boolean;
  readonly shouldShowPrompt: boolean;
}

export type InstallPromptOutcome = "accepted" | "dismissed" | "unavailable";

const INITIAL_SNAPSHOT: InstallSystemSnapshot = Object.freeze({
  hydrated: false,
  isStandalone: false,
  isMobile: false,
  isIos: false,
  canNativePrompt: false,
  dismissed: false,
  nativePromptAccepted: false,
  installedByEvent: false,
  shouldShowPrompt: false,
});

export function isIosLikePlatform(navigatorValue: InstallSystemEnvironment["navigator"]) {
  return (
    /iPad|iPhone|iPod/.test(navigatorValue.userAgent) ||
    /iPad|iPhone|iPod/.test(navigatorValue.platform) ||
    (navigatorValue.platform === "MacIntel" && navigatorValue.maxTouchPoints > 1)
  );
}

export function isDismissalActive(timestamp: string | null, now: number) {
  if (timestamp === null || timestamp.trim() === "") return false;
  const value = Number(timestamp);
  return Number.isFinite(value) && value > now - INSTALL_PROMPT_COOLDOWN_MS;
}

function browserEnvironment(): InstallSystemEnvironment {
  const storage: InstallSystemEnvironment["storage"] = {
    getItem(key) {
      return window.localStorage.getItem(key);
    },
    setItem(key, value) {
      window.localStorage.setItem(key, value);
    },
    removeItem(key) {
      window.localStorage.removeItem(key);
    },
  };
  return {
    eventTarget: window,
    matchMedia: (query) => window.matchMedia(query),
    navigator: navigator as InstallSystemEnvironment["navigator"],
    storage,
    now: () => Date.now(),
  };
}

export class InstallSystemController {
  private environment: InstallSystemEnvironment | null = null;
  private listeners = new Set<() => void>();
  private promptEvent: BeforeInstallPromptEvent | null = null;
  private standaloneQuery: InstallMediaQuery | null = null;
  private mobileQuery: InstallMediaQuery | null = null;
  private coarsePointerQuery: InstallMediaQuery | null = null;
  private mounted = 0;
  private memoryDismissedAt: string | null = null;
  private snapshot: InstallSystemSnapshot = INITIAL_SNAPSHOT;

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = () => this.snapshot;
  readonly getServerSnapshot = () => INITIAL_SNAPSHOT;

  start(environment?: InstallSystemEnvironment) {
    this.mounted += 1;
    if (this.mounted > 1) return () => this.stop();
    this.environment = environment ?? browserEnvironment();
    this.standaloneQuery = this.environment.matchMedia("(display-mode: standalone)");
    this.mobileQuery = this.environment.matchMedia("(max-width: 64rem)");
    this.coarsePointerQuery = this.environment.matchMedia("(pointer: coarse)");
    this.environment.eventTarget.addEventListener(
      "beforeinstallprompt",
      this.capturePrompt,
    );
    this.environment.eventTarget.addEventListener("appinstalled", this.markInstalled);
    this.standaloneQuery.addEventListener("change", this.refresh);
    this.mobileQuery.addEventListener("change", this.refresh);
    this.coarsePointerQuery.addEventListener("change", this.refresh);
    this.refresh();
    return () => this.stop();
  }

  dismiss() {
    const timestamp = String(this.environment?.now() ?? Date.now());
    this.memoryDismissedAt = timestamp;
    try {
      this.environment?.storage.setItem(INSTALL_PROMPT_DISMISSAL_KEY, timestamp);
    } catch {
      // Device UI preference only: an in-memory cooldown remains for this app session.
    }
    this.refresh();
  }

  async promptInstall(): Promise<InstallPromptOutcome> {
    const pending = this.promptEvent;
    if (!pending) return "unavailable";
    this.promptEvent = null;
    this.refresh();
    try {
      await pending.prompt();
      const choice = await pending.userChoice;
      if (choice.outcome === "accepted") {
        this.update({ nativePromptAccepted: true });
        return "accepted";
      }
      this.dismiss();
      return "dismissed";
    } catch {
      return "unavailable";
    }
  }

  private readonly capturePrompt = (event: Event) => {
    event.preventDefault();
    this.promptEvent = event as BeforeInstallPromptEvent;
    this.refresh();
  };

  private readonly markInstalled = () => {
    this.promptEvent = null;
    this.memoryDismissedAt = null;
    try {
      this.environment?.storage.removeItem(INSTALL_PROMPT_DISMISSAL_KEY);
    } catch {
      // Standalone state has priority over storage availability.
    }
    this.update({
      installedByEvent: true,
      nativePromptAccepted: false,
      canNativePrompt: false,
    });
  };

  private readonly refresh = () => {
    if (!this.environment) return;
    let persisted: string | null = this.memoryDismissedAt;
    try {
      persisted =
        this.environment.storage.getItem(INSTALL_PROMPT_DISMISSAL_KEY) ?? persisted;
    } catch {
      // Keep the session fallback.
    }
    const isStandalone =
      this.standaloneQuery?.matches === true ||
      this.environment.navigator.standalone === true;
    const isMobile =
      this.mobileQuery?.matches === true &&
      (this.coarsePointerQuery?.matches === true ||
        this.environment.navigator.maxTouchPoints > 0);
    const isIos = isIosLikePlatform(this.environment.navigator);
    const dismissed = isDismissalActive(persisted, this.environment.now());
    const canNativePrompt = this.promptEvent !== null;
    const installedByEvent = this.snapshot.installedByEvent;
    this.update({
      hydrated: true,
      isStandalone,
      isMobile,
      isIos,
      canNativePrompt,
      dismissed,
      installedByEvent,
      shouldShowPrompt:
        isMobile &&
        !isStandalone &&
        !this.snapshot.nativePromptAccepted &&
        !installedByEvent &&
        !dismissed &&
        (canNativePrompt || isIos),
    });
  };

  private update(next: Partial<InstallSystemSnapshot>) {
    const snapshot = { ...this.snapshot, ...next };
    snapshot.shouldShowPrompt =
      snapshot.hydrated &&
      snapshot.isMobile &&
      !snapshot.isStandalone &&
      !snapshot.nativePromptAccepted &&
      !snapshot.installedByEvent &&
      !snapshot.dismissed &&
      (snapshot.canNativePrompt || snapshot.isIos);
    if (JSON.stringify(snapshot) === JSON.stringify(this.snapshot)) return;
    this.snapshot = Object.freeze(snapshot);
    for (const listener of this.listeners) listener();
  }

  private stop() {
    this.mounted = Math.max(0, this.mounted - 1);
    if (this.mounted > 0 || !this.environment) return;
    this.environment.eventTarget.removeEventListener(
      "beforeinstallprompt",
      this.capturePrompt,
    );
    this.environment.eventTarget.removeEventListener("appinstalled", this.markInstalled);
    this.standaloneQuery?.removeEventListener("change", this.refresh);
    this.mobileQuery?.removeEventListener("change", this.refresh);
    this.coarsePointerQuery?.removeEventListener("change", this.refresh);
    this.environment = null;
    this.standaloneQuery = null;
    this.mobileQuery = null;
    this.coarsePointerQuery = null;
  }
}

export const installSystemController = new InstallSystemController();
