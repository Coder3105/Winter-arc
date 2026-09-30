import { SystemPanel } from "@/components/system/system-panel";
import type { getRewardsSummary } from "@/server/services/achievement-reward-service";

type RewardsSummary = Awaited<ReturnType<typeof getRewardsSummary>>;

export function RewardsDashboard({ summary }: { readonly summary: RewardsSummary }) {
  if (summary.kind === "UNAVAILABLE")
    return <p className="empty-state">PROFILE OR ACTIVE WINTER ARC REQUIRED</p>;
  return (
    <div className="rewards-dashboard">
      <div className="reward-counts">
        {[
          ["DAILY CLEARS", summary.counts.dailyClears],
          ["PERFECT WEEKS", summary.counts.perfectWeeks],
          ["WORKOUT WEEKS", summary.counts.workoutWeeks],
          ["MILESTONES", summary.counts.milestones],
        ].map(([label, value]) => (
          <SystemPanel eyebrow="SYSTEM REWARD" title={String(label)} key={label}>
            <strong>{value}</strong>
          </SystemPanel>
        ))}
      </div>
      <SystemPanel eyebrow="ACTIVE DIGITAL GRANTS" title="REWARD ARCHIVE">
        {summary.recent.length ? (
          <div className="reward-list">
            {summary.recent.map((reward) => (
              <article key={`${reward.type}-${reward.key}`}>
                <div>
                  <strong>{reward.title}</strong>
                  <span>{reward.type.replaceAll("_", " ")}</span>
                </div>
                <p>{reward.description}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">NO REWARDS GRANTED YET</p>
        )}
      </SystemPanel>
      <p className="progression-disclaimer">
        REWARDS ARE DIGITAL RECOGNITION ONLY. PERSONAL REWARD CONFIGURATION IS NOT
        IMPLEMENTED.
      </p>
    </div>
  );
}
