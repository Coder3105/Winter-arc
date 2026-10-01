import fs from "node:fs";
import vm from "node:vm";

import { beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (event: Record<string, unknown>) => void;

describe("Phase 12 service worker runtime", () => {
  const handlers: Record<string, Handler> = {};
  const cache = {
    addAll: vi.fn(),
    match: vi.fn(),
    put: vi.fn(),
  };
  const caches = {
    open: vi.fn(),
    keys: vi.fn(),
    delete: vi.fn(),
    match: vi.fn(),
  };
  const registration = { showNotification: vi.fn() };
  const clients = { claim: vi.fn(), matchAll: vi.fn(), openWindow: vi.fn() };
  const serviceWorker = {
    location: new URL("https://winter.example/sw.js"),
    registration,
    clients,
    skipWaiting: vi.fn(),
    addEventListener: vi.fn((name: string, handler: Handler) => {
      handlers[name] = handler;
    }),
  };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(handlers)) delete handlers[key];
    cache.addAll.mockResolvedValue(undefined);
    cache.match.mockResolvedValue(undefined);
    cache.put.mockResolvedValue(undefined);
    caches.open.mockResolvedValue(cache);
    caches.keys.mockResolvedValue([]);
    caches.delete.mockResolvedValue(true);
    caches.match.mockResolvedValue(new Response("offline"));
    registration.showNotification.mockResolvedValue(undefined);
    clients.claim.mockResolvedValue(undefined);
    clients.matchAll.mockResolvedValue([]);
    clients.openWindow.mockResolvedValue(undefined);
    fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vm.runInNewContext(fs.readFileSync("public/sw.js", "utf8"), {
      self: serviceWorker,
      caches,
      fetch: fetchMock,
      URL,
      Response,
      Promise,
    });
  });

  it("precaches the safe shell and removes only obsolete Winter Arc caches", async () => {
    let installation: Promise<unknown> | undefined;
    handlers.install?.({
      waitUntil: (promise: Promise<unknown>) => (installation = promise),
    });
    await installation;
    expect(cache.addAll).toHaveBeenCalledWith(
      expect.arrayContaining([
        "/offline.html",
        "/icons/icon-192.png",
        "/launch.html",
        "/launch.js",
        "/system-boot.css",
      ]),
    );

    caches.keys.mockResolvedValue([
      "winter-arc-safe-v11-old",
      "winter-arc-safe-v12-2",
      "another-app-cache",
    ]);
    let activation: Promise<unknown> | undefined;
    handlers.activate?.({
      waitUntil: (promise: Promise<unknown>) => (activation = promise),
    });
    await activation;
    expect(caches.delete).toHaveBeenCalledExactlyOnceWith("winter-arc-safe-v11-old");
    expect(caches.delete).not.toHaveBeenCalledWith("another-app-cache");
    expect(clients.claim).toHaveBeenCalled();
  });

  it("bypasses APIs and returns the branded fallback for failed navigation", async () => {
    const apiRespond = vi.fn();
    handlers.fetch?.({
      request: new Request("https://winter.example/api/v1/profile"),
      respondWith: apiRespond,
    });
    expect(apiRespond).not.toHaveBeenCalled();

    fetchMock.mockRejectedValueOnce(new Error("offline"));
    const fallback = new Response("safe offline");
    caches.match.mockResolvedValue(fallback);
    let responsePromise: Promise<Response> | undefined;
    handlers.fetch?.({
      request: {
        method: "GET",
        url: "https://winter.example/today",
        mode: "navigate",
      },
      respondWith: (promise: Promise<Response>) => (responsePromise = promise),
    });
    expect(await responsePromise).toBe(fallback);
    expect(cache.put).not.toHaveBeenCalled();
  });

  it.each(["/launch.html", "/launch.js", "/system-boot.css"])(
    "serves the public boot asset %s from cache without waiting for the network",
    async (path) => {
      const cached = new Response("public boot asset");
      cache.match.mockResolvedValue(cached);
      let responsePromise: Promise<Response> | undefined;
      handlers.fetch?.({
        request: {
          method: "GET",
          url: `https://winter.example${path}`,
          mode: path.endsWith("html") ? "navigate" : "cors",
        },
        respondWith: (promise: Promise<Response>) => (responsePromise = promise),
      });
      expect(await responsePromise).toBe(cached);
      expect(cache.match).toHaveBeenCalledWith(path);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("fetches a missing boot shell and never stores authenticated navigations", async () => {
    for (const path of ["/launch.html", "/", "/today"]) {
      let responsePromise: Promise<Response> | undefined;
      handlers.fetch?.({
        request: {
          method: "GET",
          url: `https://winter.example${path}`,
          mode: "navigate",
        },
        respondWith: (promise: Promise<Response>) => (responsePromise = promise),
      });
      expect((await responsePromise)?.status).toBe(200);
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("does not serve boot assets for another origin", () => {
    const respondWith = vi.fn();
    handlers.fetch?.({
      request: new Request("https://other.example/launch.js"),
      respondWith,
    });
    expect(respondWith).not.toHaveBeenCalled();
  });

  it("shows a safe fallback for malformed push data", async () => {
    let work: Promise<unknown> | undefined;
    handlers.push?.({
      data: {
        json: () => {
          throw new Error("bad payload");
        },
      },
      waitUntil: (promise: Promise<unknown>) => (work = promise),
    });
    await work;
    expect(registration.showNotification).toHaveBeenCalledWith(
      "Winter Arc",
      expect.objectContaining({
        body: "A System update is available.",
        data: { path: "/notifications" },
      }),
    );
  });

  it("focuses an existing window and rejects external click destinations", async () => {
    const navigate = vi.fn().mockResolvedValue(undefined);
    const focus = vi.fn().mockResolvedValue(undefined);
    clients.matchAll.mockResolvedValue([
      { url: "https://winter.example/today", navigate, focus },
    ]);
    let work: Promise<unknown> | undefined;
    const close = vi.fn();
    handlers.notificationclick?.({
      notification: { close, data: { path: "https://evil.test" } },
      waitUntil: (promise: Promise<unknown>) => (work = promise),
    });
    await work;
    expect(close).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("https://winter.example/notifications");
    expect(focus).toHaveBeenCalled();
    expect(clients.openWindow).not.toHaveBeenCalled();
  });

  it("activates a waiting worker only after an explicit message", () => {
    handlers.message?.({ data: { type: "OTHER" } });
    expect(serviceWorker.skipWaiting).not.toHaveBeenCalled();
    handlers.message?.({ data: { type: "SKIP_WAITING" } });
    expect(serviceWorker.skipWaiting).toHaveBeenCalledTimes(1);
  });
});
