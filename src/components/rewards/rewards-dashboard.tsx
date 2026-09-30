import { SystemPanel } from "@/components/system/system-panel";
import { ShadowPortrait, type ShadowSoldier } from "@/components/system/shadow-portrait";
import type { getRewardsSummary } from "@/server/services/achievement-reward-service";

type RewardsSummary = Awaited<ReturnType<typeof getRewardsSummary>>;

export function RewardsDashboard({ summary }: { readonly summary: RewardsSummary }) {
  if (summary.kind === "UNAVAILABLE")
    return <p className="empty-state">PROFILE OR ACTIVE WINTER ARC REQUIRED</p>;
  return (
    <div className="rewards-dashboard">
      <section className="shadow-vault-hero">
        <div>
          <span>SYSTEM // REWARD VAULT</span>
          <h2>
            THE SPOILS OF
            <br />
            CONSISTENCY.
          </h2>
          <p>Every clear leaves a mark. Your earned rewards are recorded here.</p>
        </div>
        <ShadowPortrait soldier="iron" size={176} />
      </section>
      <div className="reward-counts shadow-reward-counts">
        {[
          {
            label: "DAILY CLEARS",
            value: summary.counts.dailyClears,
            soldier: "beru",
            caption: "CLEAR MARKS",
          },
          {
            label: "PERFECT WEEKS",
            value: summary.counts.perfectWeeks,
            soldier: "igris",
            caption: "OATH EMBLEMS",
          },
          {
            label: "WORKOUT WEEKS",
            value: summary.counts.workoutWeeks,
            soldier: "iron",
            caption: "TRAINING CRESTS",
          },
          {
            label: "MILESTONES",
            value: summary.counts.milestones,
            soldier: "beru",
            caption: "ASCENSION EMBLEMS",
          },
        ].map(({ label, value, soldier, caption }) => (
          <SystemPanel
            eyebrow={caption}
            title={label}
            key={label}
            className="shadow-reward-card"
          >
            <ShadowPortrait soldier={soldier as ShadowSoldier} size={72} />
            <div>
              <strong>{value}</strong>
              <small>{value === 1 ? "EARNED RECORD" : "EARNED RECORDS"}</small>
            </div>
          </SystemPanel>
        ))}
      </div>
      <SystemPanel eyebrow="SYSTEM // DIGITAL GRANTS" title="REWARD ARCHIVE">
        {summary.recent.length ? (
          <div className="reward-list">
            {summary.recent.map((reward) => (
              <article
                key={`${reward.type}-${reward.key}`}
                className="shadow-reward-entry"
              >
                <span className="shadow-reward-entry__sigil" aria-hidden="true">
                  ◇
                </span>
                <div className="shadow-reward-entry__copy">
                  <strong>{reward.title}</strong>
                  <span>{reward.type.replaceAll("_", " ")}</span>
                  <p>{reward.description}</p>
                </div>
                <small className="shadow-reward-entry__earned">EARNED</small>
              </article>
            ))}
          </div>
        ) : (
          <div className="shadow-vault-empty">
            <span aria-hidden="true">◇</span>
            <p className="empty-state">NO REWARDS GRANTED YET</p>
            <p>
              Your first clear is waiting. Complete a Perfect Day to begin your archive.
            </p>
          </div>
        )}
      </SystemPanel>
      <p className="progression-disclaimer">
        REWARDS ARE DIGITAL RECOGNITION ONLY. PERSONAL REWARD CONFIGURATION IS NOT
        IMPLEMENTED.
      </p>
    </div>
  );
}
