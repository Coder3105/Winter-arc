"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { UpdateDialog } from "./update-dialog";

export function shouldRegisterServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return false;
  return (
    process.env.NODE_ENV === "production" ||
    new URLSearchParams(window.location.search).get("pwa-test") === "1"
  );
}

export function PwaRuntime() {
  const router = useRouter();
  const [offline, setOffline] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    const redirectToLogin = (event: Event) => {
      const next =
        event instanceof CustomEvent &&
        typeof (event.detail as { next?: unknown } | null)?.next === "string"
          ? (event.detail as { next: string }).next
          : "/";
      router.replace(`/login?next=${encodeURIComponent(next)}`);
      router.refresh();
    };
    window.addEventListener("auth:expired", redirectToLogin);
    return () => window.removeEventListener("auth:expired", redirectToLogin);
  }, [router]);

  useEffect(() => {
    const sync = () => {
      const isOffline = !navigator.onLine;
      setOffline(isOffline);
      document.documentElement.dataset.network = isOffline ? "offline" : "online";
    };
    const guard = (event: Event) => {
      if (navigator.onLine) return;
      const target = event.target;
      if (!(target instanceof Element) || target.closest("[data-offline-allowed]"))
        return;
      if (event.type === "submit" || target.closest("button")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setOffline(true);
      }
    };
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    document.addEventListener("click", guard, true);
    document.addEventListener("submit", guard, true);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      document.removeEventListener("click", guard, true);
      document.removeEventListener("submit", guard, true);
    };
  }, []);

  useEffect(() => {
    if (!shouldRegisterServiceWorker()) return;
    let reloading = false;
    const controllerChange = () => {
      if (!reloading) {
        reloading = true;
        window.location.reload();
      }
    };
    navigator.serviceWorker.addEventListener("controllerchange", controllerChange);
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        if (registration.waiting) setWaiting(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              setWaiting(worker);
            }
          });
        });
      })
      .catch(() => undefined);
    return () =>
      navigator.serviceWorker.removeEventListener("controllerchange", controllerChange);
  }, []);

  return (
    <>
      <div className="pwa-system-messages" aria-live="polite">
        {offline && (
          <div className="pwa-banner pwa-banner--offline">
            CONNECTION REQUIRED // Private tracking is unavailable offline.
          </div>
        )}
      </div>
      {waiting && (
        <UpdateDialog
          offline={offline}
          onUpdate={() => waiting.postMessage({ type: "SKIP_WAITING" })}
          onLater={() => setWaiting(null)}
        />
      )}
    </>
  );
}
