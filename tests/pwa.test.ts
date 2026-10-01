import fs from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import manifest from "@/app/manifest";
import { DevicePushSettings } from "@/components/notifications/device-push-settings";
import { InstallGuide } from "@/components/pwa/install-guide";
import { isSafeInternalPath } from "@/lib/pwa/safe-path";

describe("Phase 12 installable PWA", () => {
  it("publishes a scoped standalone manifest with normal and maskable icons", () => {
    const value = manifest();
    expect(value).toMatchObject({
      id: "/",
      name: "Winter Arc",
      short_name: "Winter Arc",
      start_url: "/launch.html",
      scope: "/",
      display: "standalone",
      background_color: "#03070c",
      theme_color: "#03070c",
    });
    expect(value.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: "/icons/icon-192.png", sizes: "192x192" }),
        expect.objectContaining({ src: "/icons/icon-512.png", sizes: "512x512" }),
        expect.objectContaining({
          src: "/icons/icon-maskable-512.png",
          sizes: "512x512",
          purpose: "maskable",
        }),
      ]),
    );
  });

  it.each([
    ["icon-192.png", 192],
    ["icon-512.png", 512],
    ["icon-maskable-512.png", 512],
    ["apple-touch-icon.png", 180],
    ["badge-96.png", 96],
  ])("has a valid, non-empty %s asset", async (name, expectedSize) => {
    const file = path.join(process.cwd(), "public", "icons", name);
    const [stat, metadata] = await Promise.all([fs.stat(file), sharp(file).metadata()]);
    expect(stat.size).toBeGreaterThan(100);
    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(expectedSize);
    expect(metadata.height).toBe(expectedSize);
  });

  it("serves an actual favicon without copying the design reference", async () => {
    const favicon = await fs.stat(path.join(process.cwd(), "public", "favicon.ico"));
    expect(favicon.size).toBeGreaterThan(100);
    const source = await fs.readFile(
      path.join(process.cwd(), "scripts", "generate-pwa-icons.mjs"),
      "utf8",
    );
    expect(source).toContain("system-mark.svg");
    expect(source).not.toContain("ChatGPT Image");
  });

  it("keeps API and navigation responses out of cache storage", async () => {
    const worker = await fs.readFile(path.join(process.cwd(), "public", "sw.js"), "utf8");
    expect(worker).toContain('url.pathname.startsWith("/api/")');
    expect(worker).toContain('request.mode === "navigate"');
    expect(worker).toContain("fetch(request).catch");
    expect(worker).toContain('url.pathname.startsWith("/_next/static/")');
    expect(worker).toContain('url.pathname.startsWith("/icons/")');
    expect(worker).not.toContain('request.destination === "image"');
    expect(worker).toContain('event.data?.type === "SKIP_WAITING"');
    expect(worker).not.toContain(
      'skipWaiting();\n});\n\nself.addEventListener("activate"',
    );
  });

  it("allows only controlled internal notification paths", () => {
    expect(isSafeInternalPath("/today")).toBe(true);
    expect(isSafeInternalPath("/reports/week/4")).toBe(true);
    for (const pathValue of [
      "https://evil.test",
      "//evil.test",
      "javascript:alert(1)",
      "/profile",
      "/today\\evil",
    ]) {
      expect(isSafeInternalPath(pathValue)).toBe(false);
    }
  });

  it("renders install and device-push states without requesting permission", async () => {
    const install = renderToStaticMarkup(createElement(InstallGuide));
    expect(install).toContain("BROWSER MODE");
    expect(install).toContain("secure supported browser");
    const push = renderToStaticMarkup(
      createElement(DevicePushSettings, {
        initialStatus: {
          configured: false,
          vapidPublicKey: null,
          activeSubscriptionCount: 0,
          hasActiveSubscription: false,
        },
      }),
    );
    expect(push).toContain("DEVICE PUSH");
    expect(push).toContain("NOT CONFIGURED");
    expect(push).toContain("separate from reminder timing");

    const source = await fs.readFile(
      path.join(process.cwd(), "src", "lib", "pwa", "push-client.ts"),
      "utf8",
    );
    expect(source.match(/Notification\.requestPermission\(\)/g)).toHaveLength(1);
    expect(source.indexOf("Notification.requestPermission()")).toBeGreaterThan(
      source.indexOf("export async function enableDevicePush"),
    );
  });

  it("keeps install, offline mutation, and update activation user-controlled", async () => {
    const [installSource, runtimeSource] = await Promise.all([
      fs.readFile(
        path.join(process.cwd(), "src", "components", "pwa", "install-guide.tsx"),
        "utf8",
      ),
      fs.readFile(
        path.join(process.cwd(), "src", "components", "pwa", "pwa-runtime.tsx"),
        "utf8",
      ),
    ]);
    expect(installSource).toContain('window.addEventListener("beforeinstallprompt"');
    expect(installSource.indexOf("await prompt.prompt()")).toBeGreaterThan(
      installSource.indexOf("async function install()"),
    );
    expect(runtimeSource).toContain('register("/sw.js", { scope: "/" })');
    expect(runtimeSource).toContain('registration.addEventListener("updatefound"');
    expect(runtimeSource).toContain('waiting.postMessage({ type: "SKIP_WAITING" })');
    expect(runtimeSource).toContain('addEventListener("controllerchange"');
    expect(runtimeSource).toContain("window.location.reload()");
    expect(runtimeSource).toContain("event.stopImmediatePropagation()");
  });
});
