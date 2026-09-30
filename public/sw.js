/* Winter Arc Phase 12 service worker: safe shell assets only. */
const CACHE_PREFIX = "winter-arc-safe-";
const CACHE_VERSION = "v12-1";
const STATIC_CACHE = `${CACHE_PREFIX}${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [
  OFFLINE_URL,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/badge-96.png",
];

function isApiRequest(url) {
  return url.origin === self.location.origin && url.pathname.startsWith("/api/");
}

function isSafeStaticRequest(request, url) {
  if (url.origin !== self.location.origin || isApiRequest(url)) return false;
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/favicon.ico" ||
    url.pathname === "/manifest.webmanifest"
  );
}

function safeActionPath(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/notifications";
  }
  if (value.includes("\\") || /[\u0000-\u001f]/.test(value)) return "/notifications";
  const controlled = [
    "/today",
    "/workouts",
    "/status",
    "/achievements",
    "/rewards",
    "/notifications",
  ];
  return controlled.includes(value) || /^\/reports\/week\/[1-9]\d*$/.test(value)
    ? value
    : "/notifications";
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== STATIC_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (isApiRequest(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(OFFLINE_URL);
        return cached || Response.error();
      }),
    );
    return;
  }

  if (!isSafeStaticRequest(request, url)) return;
  event.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && response.type === "basic") {
        await cache.put(request, response.clone());
      }
      return response;
    }),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = {};
  }
  const title =
    typeof payload.title === "string" ? payload.title.slice(0, 120) : "Winter Arc";
  const body =
    typeof payload.body === "string"
      ? payload.body.slice(0, 500)
      : "A System update is available.";
  const path = safeActionPath(payload.data?.path);
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag:
        typeof payload.tag === "string" ? payload.tag.slice(0, 100) : "winter-arc-update",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      data: { path },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = safeActionPath(event.notification.data?.path);
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (clients) => {
        const existing = clients.find(
          (client) => new URL(client.url).origin === self.location.origin,
        );
        if (existing) {
          await existing.navigate(target);
          return existing.focus();
        }
        return self.clients.openWindow(target);
      }),
  );
});
