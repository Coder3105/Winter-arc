import { AuthenticatedHeader } from "@/components/layout/authenticated-header";
import { RewardsDashboard } from "@/components/rewards/rewards-dashboard";
import { requirePageOwner } from "@/server/auth/request-auth";
import { getRewardsSummary } from "@/server/services/achievement-reward-service";

export default async function RewardsPage() {
  const owner = await requirePageOwner();
  const summary = await getRewardsSummary(owner.id);
  return (
    <main className="app-shell">
      <div className="app-frame app-frame--wide">
        <AuthenticatedHeader displayName={owner.displayName} section="REWARDS" />
        <div className="page-heading">
          <p>SYSTEM // DIGITAL RECOGNITION</p>
          <h1>REWARDS</h1>
        </div>
        <RewardsDashboard summary={summary} />
      </div>
    </main>
  );
}
