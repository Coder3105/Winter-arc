import { AuthenticatedHeader } from "@/components/layout/authenticated-header";
import { TodayTracker } from "@/components/daily-quest/today-tracker";
import { ProgressionStatus } from "@/components/progression/progression-status";
import { RecoveryPanel } from "@/components/recovery/recovery-panel";
import { WorkoutTracker } from "@/components/workouts/workout-tracker";
import { requirePageOwner } from "@/server/auth/request-auth";
import { getRecoverySummary } from "@/server/services/achievement-reward-service";
import { getOrCreateTodayDailyQuest } from "@/server/services/daily-quest-service";
import { getProgressionSummary } from "@/server/services/progression-service";
import { getCurrentWorkoutDashboard } from "@/server/services/workout-service";
import { getTodayWeight } from "@/server/services/weight-service";

export default async function TodayPage() {
  const owner = await requirePageOwner();
  const weightResult = await getTodayWeight(owner.id);
  const [result, workoutResult] = await Promise.all([
    getOrCreateTodayDailyQuest(owner.id),
    getCurrentWorkoutDashboard(owner.id),
  ]);
  const [progression, recovery] = await Promise.all([
    getProgressionSummary(owner.id),
    getRecoverySummary(owner.id),
  ]);

  return (
    <main className="app-shell">
      <div className="app-frame app-frame--wide today-page">
        <AuthenticatedHeader
          displayName={owner.displayName}
          section="DAILY QUEST"
          active="TODAY"
        />
        <div className="page-heading">
          <p>SYSTEM // TODAY</p>
          <h1>DAILY QUEST</h1>
        </div>
        <ProgressionStatus initialSummary={progression} />
        <RecoveryPanel summary={recovery} />
        <TodayTracker initialResult={result} initialWeightResult={weightResult} />
        <div className="today-workout-separator" aria-hidden="true" />
        <WorkoutTracker initialResult={workoutResult} />
      </div>
    </main>
  );
}
