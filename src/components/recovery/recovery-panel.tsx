import { SystemPanel } from "@/components/system/system-panel";
import type { getRecoverySummary } from "@/server/services/achievement-reward-service";

type RecoverySummary = Awaited<ReturnType<typeof getRecoverySummary>>;

export function RecoveryPanel({ summary }: { readonly summary: RecoverySummary }) {
  if (summary.kind === "UNAVAILABLE" || summary.active.length === 0) return null;
  return (
    <SystemPanel eyebrow="SYSTEM // CONSTRUCTIVE RECOVERY" title="RECOVERY MODE">
      <div className="recovery-list">
        {summary.active.map((protocol) => (
          <article key={`${protocol.type}-${protocol.assignedAt}`}>
            <div>
              <strong>
                {protocol.type === "DAILY_RECOVERY" ? "DAILY RESET" : "WEEKLY RESET"}
              </strong>
              <span>
                {protocol.failureCount} finalized miss
                {protocol.failureCount === 1 ? "" : "es"} consolidated
              </span>
            </div>
            <p>
              {protocol.type === "DAILY_RECOVERY"
                ? "Clear one future Perfect Day to close this recovery protocol."
                : `Secure a normal ${summary.configuredWorkoutTarget}-day weekly mission to close this recovery protocol.`}
            </p>
          </article>
        ))}
      </div>
      <p className="recovery-safety">
        No negative XP or punitive requirement applies. Resume the normal protocol.
      </p>
    </SystemPanel>
  );
}
