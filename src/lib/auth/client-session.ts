export function redirectExpiredSession(response: Response): boolean {
  if (response.status !== 401 || typeof window === "undefined") return false;

  const intended = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const next = intended.startsWith("/") && !intended.startsWith("//") ? intended : "/";
  window.dispatchEvent(new CustomEvent("auth:expired", { detail: { next } }));
  return true;
}

export function safeInternalRedirect(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const parsed = new URL(value, "https://winter-arc.local");
    return parsed.origin === "https://winter-arc.local"
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : "/";
  } catch {
    return "/";
  }
}
