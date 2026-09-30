import { AuthenticatedHeader } from "@/components/layout/authenticated-header";
import { RecoveryPanel } from "@/components/recovery/recovery-panel";
import { WorkoutTracker } from "@/components/workouts/workout-tracker";
import { requirePageOwner } from "@/server/auth/request-auth";
import { getRecoverySummary } from "@/server/services/achievement-reward-service";
import { getCurrentWorkoutDashboard } from "@/server/services/workout-service";

export default async function WorkoutsPage() {
  const owner = await requirePageOwner();
  const [result, recovery] = await Promise.all([
    getCurrentWorkoutDashboard(owner.id),
    getRecoverySummary(owner.id),
  ]);
  return (
    <main className="app-shell">
      <div className="app-frame app-frame--wide workout-page">
        <AuthenticatedHeader
          displayName={owner.displayName}
          section="WEEKLY MISSION"
          active="WORKOUTS"
        />
        <div className="page-heading">
          <p>SYSTEM // 4 OF 7 // CHALLENGE WEEK</p>
          <h1>WEEKLY MISSION</h1>
        </div>
        <RecoveryPanel summary={recovery} />
        <WorkoutTracker initialResult={result} full />
      </div>
    </main>
  );
}
