/** Canonical identity only; never apply provider-specific dot/plus rewriting. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Presentation-only masking. Never use this value as an account identity. */
export function maskEmail(email: string): string {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf("@");
  if (at <= 0 || at === normalized.length - 1) return "***";
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  return `${local.slice(0, 1)}***@${domain}`;
}
