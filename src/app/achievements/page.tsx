import { AchievementDashboard } from "@/components/achievements/achievement-dashboard";
import { AuthenticatedHeader } from "@/components/layout/authenticated-header";
import { requirePageOwner } from "@/server/auth/request-auth";
import { getAchievementsSummary } from "@/server/services/achievement-reward-service";

export default async function AchievementsPage() {
  const owner = await requirePageOwner();
  const summary = await getAchievementsSummary(owner.id);
  return (
    <main className="app-shell">
      <div className="app-frame app-frame--wide">
        <AuthenticatedHeader displayName={owner.displayName} section="ACHIEVEMENTS" />
        <div className="page-heading">
          <p>SYSTEM // MILESTONES // TITLES</p>
          <h1>ACHIEVEMENTS</h1>
        </div>
        <AchievementDashboard initialSummary={summary} />
      </div>
    </main>
  );
}
