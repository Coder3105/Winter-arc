/** Legacy rollout compatibility applies only when no V2 status exists. */
export const ACTIVE_ACCOUNT_FILTER = {
  $or: [
    { status: "ACTIVE" as const, isActive: { $ne: false } },
    { status: { $exists: false }, isActive: true },
  ],
};
