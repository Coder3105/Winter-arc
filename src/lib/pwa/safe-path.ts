const controlledRoutes = [
  "/today",
  "/workouts",
  "/status",
  "/achievements",
  "/rewards",
  "/notifications",
] as const;

export function isSafeInternalPath(path: unknown): path is string {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) {
    return false;
  }
  if (path.includes("\\") || /[\u0000-\u001f]/.test(path)) return false;
  return (
    controlledRoutes.includes(path as (typeof controlledRoutes)[number]) ||
    /^\/reports\/week\/[1-9]\d*$/.test(path)
  );
}
