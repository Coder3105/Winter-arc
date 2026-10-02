import fs from "node:fs/promises";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/today" }));

import {
  InstallInstructionsDialog,
  InstallSystemPrompt,
} from "@/components/pwa/install-system-prompt";
import {
  INSTALL_PROMPT_COOLDOWN_DAYS,
  INSTALL_PROMPT_COOLDOWN_MS,
  INSTALL_PROMPT_DISMISSAL_KEY,
  InstallSystemController,
  isDismissalActive,
  isIosLikePlatform,
  type BeforeInstallPromptEvent,
  type InstallSystemEnvironment,
} from "@/lib/pwa/install-system";

class FakeMediaQuery extends EventTarget {
  constructor(public matches: boolean) {
    super();
  }

  set(matches: boolean) {
    this.matches = matches;
    this.dispatchEvent(new Event("change"));
  }
}

function fixture({
  mobile = true,
  coarse = true,
  standalone = false,
  navigatorStandalone = false,
  userAgent = "Mozilla/5.0 (Linux; Android 14)",
  platform = "Linux armv8l",
  maxTouchPoints = 5,
  storageThrows = false,
  stored = new Map<string, string>(),
  now = Date.UTC(2026, 9, 2),
} = {}) {
  const target = new EventTarget();
  const media = {
    "(display-mode: standalone)": new FakeMediaQuery(standalone),
    "(max-width: 64rem)": new FakeMediaQuery(mobile),
    "(pointer: coarse)": new FakeMediaQuery(coarse),
  };
  let currentTime = now;
  const environment: InstallSystemEnvironment = {
    eventTarget: target,
    matchMedia: (query) => media[query as keyof typeof media],
    navigator: {
      userAgent,
      platform,
      maxTouchPoints,
      standalone: navigatorStandalone,
    },
    storage: {
      getItem(key) {
        if (storageThrows) throw new Error("blocked");
        return stored.get(key) ?? null;
      },
      setItem(key, value) {
        if (storageThrows) throw new Error("blocked");
        stored.set(key, value);
      },
      removeItem(key) {
        if (storageThrows) throw new Error("blocked");
        stored.delete(key);
      },
    },
    now: () => currentTime,
  };
  return {
    environment,
    media,
    stored,
    target,
    setNow(value: number) {
      currentTime = value;
    },
  };
}

function deferredPrompt(outcome: "accepted" | "dismissed") {
  const event = new Event("beforeinstallprompt", {
    cancelable: true,
  }) as BeforeInstallPromptEvent;
  const prompt = vi.fn().mockResolvedValue(undefined);
  Object.defineProperties(event, {
    prompt: { value: prompt },
    userChoice: { value: Promise.resolve({ outcome }) },
  });
  return { event, prompt };
}

describe("V2.6 Install System controller", () => {
  it("captures a mobile native prompt without invoking it before explicit action", async () => {
    const setup = fixture();
    const controller = new InstallSystemController();
    const stop = controller.start(setup.environment);
    const native = deferredPrompt("accepted");
    setup.target.dispatchEvent(native.event);
    expect(native.event.defaultPrevented).toBe(true);
    expect(native.prompt).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toMatchObject({
      hydrated: true,
      isMobile: true,
      canNativePrompt: true,
      shouldShowPrompt: true,
    });
    await expect(controller.promptInstall()).resolves.toBe("accepted");
    expect(native.prompt).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({
      canNativePrompt: false,
      nativePromptAccepted: true,
      installedByEvent: false,
      shouldShowPrompt: false,
    });
    await expect(controller.promptInstall()).resolves.toBe("unavailable");
    expect(native.prompt).toHaveBeenCalledTimes(1);
    stop();
  });

  it("applies the seven-day cooldown after native dismissal and expires it", async () => {
    const setup = fixture();
    const controller = new InstallSystemController();
    const stop = controller.start(setup.environment);
    setup.target.dispatchEvent(deferredPrompt("dismissed").event);
    await expect(controller.promptInstall()).resolves.toBe("dismissed");
    expect(setup.stored.has(INSTALL_PROMPT_DISMISSAL_KEY)).toBe(true);
    expect(controller.getSnapshot()).toMatchObject({
      dismissed: true,
      shouldShowPrompt: false,
    });
    setup.setNow(Date.UTC(2026, 9, 2) + INSTALL_PROMPT_COOLDOWN_MS - 1);
    setup.media["(max-width: 64rem)"].set(true);
    expect(controller.getSnapshot().dismissed).toBe(true);
    setup.setNow(Date.UTC(2026, 9, 2) + INSTALL_PROMPT_COOLDOWN_MS + 1);
    setup.media["(max-width: 64rem)"].set(true);
    expect(controller.getSnapshot().dismissed).toBe(false);
    stop();
  });

  it("keeps a route/reload dismissal device-local for any signed-in user", () => {
    const sharedStorage = new Map<string, string>();
    const first = fixture({
      userAgent: "Mozilla/5.0 (iPhone)",
      platform: "iPhone",
      stored: sharedStorage,
    });
    const controllerA = new InstallSystemController();
    const stopA = controllerA.start(first.environment);
    expect(controllerA.getSnapshot().shouldShowPrompt).toBe(true);
    controllerA.dismiss();
    stopA();

    const second = fixture({
      userAgent: "Mozilla/5.0 (iPhone)",
      platform: "iPhone",
      stored: sharedStorage,
    });
    const controllerB = new InstallSystemController();
    const stopB = controllerB.start(second.environment);
    expect(controllerB.getSnapshot()).toMatchObject({
      dismissed: true,
      shouldShowPrompt: false,
    });
    stopB();
  });

  it("uses an in-memory dismissal when localStorage is unavailable", () => {
    const setup = fixture({
      userAgent: "Mozilla/5.0 (iPhone)",
      platform: "iPhone",
      storageThrows: true,
    });
    const controller = new InstallSystemController();
    const stop = controller.start(setup.environment);
    expect(() => controller.dismiss()).not.toThrow();
    expect(controller.getSnapshot()).toMatchObject({
      dismissed: true,
      shouldShowPrompt: false,
    });
    stop();
  });

  it("offers manual instructions on iOS, including desktop-style iPad UA", () => {
    const iphone = fixture({
      userAgent: "Mozilla/5.0 (iPhone)",
      platform: "iPhone",
    });
    const ipad = fixture({
      userAgent: "Mozilla/5.0 (Macintosh)",
      platform: "MacIntel",
      maxTouchPoints: 5,
    });
    expect(isIosLikePlatform(iphone.environment.navigator)).toBe(true);
    expect(isIosLikePlatform(ipad.environment.navigator)).toBe(true);
    for (const setup of [iphone, ipad]) {
      const controller = new InstallSystemController();
      const stop = controller.start(setup.environment);
      expect(controller.getSnapshot()).toMatchObject({
        isIos: true,
        canNativePrompt: false,
        shouldShowPrompt: true,
      });
      stop();
    }
  });

  it.each([
    ["display mode", { standalone: true }],
    ["navigator.standalone", { navigatorStandalone: true }],
  ])("gives installed state priority through %s", (_label, options) => {
    const setup = fixture({
      ...options,
      userAgent: "Mozilla/5.0 (iPhone)",
      platform: "iPhone",
    });
    const controller = new InstallSystemController();
    const stop = controller.start(setup.environment);
    expect(controller.getSnapshot()).toMatchObject({
      isStandalone: true,
      shouldShowPrompt: false,
    });
    stop();
  });

  it("hides the automatic panel on desktop even when native prompting is available", () => {
    const setup = fixture({ mobile: false, coarse: false, maxTouchPoints: 0 });
    const controller = new InstallSystemController();
    const stop = controller.start(setup.environment);
    setup.target.dispatchEvent(deferredPrompt("accepted").event);
    expect(controller.getSnapshot()).toMatchObject({
      isMobile: false,
      canNativePrompt: true,
      shouldShowPrompt: false,
    });
    stop();
  });

  it("waits for capability on non-iOS mobile browsers", () => {
    const setup = fixture();
    const controller = new InstallSystemController();
    const stop = controller.start(setup.environment);
    expect(controller.getSnapshot()).toMatchObject({
      isMobile: true,
      isIos: false,
      canNativePrompt: false,
      shouldShowPrompt: false,
    });
    stop();
  });

  it("hides immediately and clears pending state on appinstalled", () => {
    const setup = fixture();
    setup.stored.set(INSTALL_PROMPT_DISMISSAL_KEY, "1");
    const controller = new InstallSystemController();
    const stop = controller.start(setup.environment);
    setup.target.dispatchEvent(deferredPrompt("accepted").event);
    setup.target.dispatchEvent(new Event("appinstalled"));
    expect(controller.getSnapshot()).toMatchObject({
      installedByEvent: true,
      nativePromptAccepted: false,
      canNativePrompt: false,
      shouldShowPrompt: false,
    });
    expect(setup.stored.has(INSTALL_PROMPT_DISMISSAL_KEY)).toBe(false);
    stop();
  });

  it("removes browser and media listeners when the final consumer unmounts", () => {
    const setup = fixture();
    const controller = new InstallSystemController();
    const stop = controller.start(setup.environment);
    stop();
    setup.target.dispatchEvent(deferredPrompt("accepted").event);
    expect(controller.getSnapshot().canNativePrompt).toBe(false);
  });

  it("uses a stable namespaced cooldown contract", () => {
    expect(INSTALL_PROMPT_COOLDOWN_DAYS).toBe(7);
    expect(INSTALL_PROMPT_DISMISSAL_KEY).toBe("winter-arc:install-prompt-dismissed-at");
    const now = Date.UTC(2026, 9, 9);
    expect(isDismissalActive(String(now - INSTALL_PROMPT_COOLDOWN_MS + 1), now)).toBe(
      true,
    );
    expect(isDismissalActive(String(now - INSTALL_PROMPT_COOLDOWN_MS - 1), now)).toBe(
      false,
    );
  });
});

describe("V2.6 Install System accessibility and layout contract", () => {
  it("renders no automatic install panel in the initial server snapshot", () => {
    expect(renderToStaticMarkup(createElement(InstallSystemPrompt))).toBe("");
  });

  it("renders an associated manual instruction dialog with explicit controls", () => {
    const html = renderToStaticMarkup(
      createElement(InstallInstructionsDialog, {
        open: true,
        onClose: vi.fn(),
        onComplete: vi.fn(),
      }),
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("aria-labelledby");
    expect(html).toContain("Close install instructions");
    expect(html).toContain("Add to Home Screen");
    expect(html).toContain("GOT IT");
    expect(html).toContain('href="/install"');
  });

  it("positions above measured navigation and safe area with reduced motion", async () => {
    const css = await fs.readFile(
      path.join(process.cwd(), "src", "app", "install-system.css"),
      "utf8",
    );
    expect(css).toContain("var(--mobile-navigation-height)");
    expect(css).toContain("env(safe-area-inset-bottom)");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("max-height");
    expect(css).toContain("orientation: landscape");
  });

  it("mounts once in the shared runtime and suppresses itself for active form input", async () => {
    const [runtime, prompt] = await Promise.all([
      fs.readFile(
        path.join(process.cwd(), "src", "components", "pwa", "pwa-runtime.tsx"),
        "utf8",
      ),
      fs.readFile(
        path.join(process.cwd(), "src", "components", "pwa", "install-system-prompt.tsx"),
        "utf8",
      ),
    ]);
    expect(runtime.match(/<InstallSystemPrompt/g)).toHaveLength(1);
    expect(prompt).toContain("input, textarea, select");
    expect(prompt).toContain("ResizeObserver");
    expect(prompt).toContain('pathname !== "/install"');
    expect(prompt).toContain("onCancel");
    expect(prompt).toContain('event.key !== "Tab"');
  });
});
