/* Winter Arc Phase 12 service worker: safe shell assets only. */
const CACHE_PREFIX = "winter-arc-safe-";
const CACHE_VERSION = "v12-2";
const STATIC_CACHE = `${CACHE_PREFIX}${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";
const LAUNCH_ASSETS = ["/launch.html", "/system-boot.css", "/launch.js"];
const PRECACHE = [
  OFFLINE_URL,
  ...LAUNCH_ASSETS,
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

  // Only this public, data-free launch shell may bypass network-first navigation.
  if (url.origin === self.location.origin && LAUNCH_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(url.pathname);
        return cached || fetch(request);
      }),
    );
    return;
  }

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
  event.waitUntil(
    (async () => {
      // A subscription stays with its owner after logout. Never show that owner's
      // details to a different signed-in user, or trust offline/legacy payloads.
      let sameUser = false;
      if (/^[a-f0-9]{64}$/.test(payload.recipientUserHash ?? "")) {
        try {
          const response = await fetch("/api/v1/auth/me", {
            credentials: "same-origin",
            cache: "no-store",
          });
          const session = response.ok ? await response.json() : null;
          const currentUserId =
            session?.success === true ? session.data?.owner?.id : null;
          if (typeof currentUserId === "string") {
            const digest = await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(currentUserId),
            );
            const currentUserHash = Array.from(new Uint8Array(digest))
              .map((byte) => byte.toString(16).padStart(2, "0"))
              .join("");
            sameUser = currentUserHash === payload.recipientUserHash;
          }
        } catch {
          sameUser = false;
        }
      }
      const title =
        sameUser && typeof payload.title === "string"
          ? payload.title.slice(0, 120)
          : "Winter Arc";
      const body =
        sameUser && typeof payload.body === "string"
          ? payload.body.slice(0, 500)
          : "A System update is available.";
      const path = sameUser ? safeActionPath(payload.data?.path) : "/notifications";
      return self.registration.showNotification(title, {
        body,
        tag:
          sameUser && typeof payload.tag === "string"
            ? payload.tag.slice(0, 100)
            : "winter-arc-update",
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-96.png",
        data: { path },
      });
    })(),
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
