import { AuthenticatedHeader } from "@/components/layout/authenticated-header";
import { ProgressionStatus } from "@/components/progression/progression-status";
import { LatestReportPanel } from "@/components/reports/report-list";
import { requirePageOwner } from "@/server/auth/request-auth";
import { getProgressionSummary } from "@/server/services/progression-service";
import { getWeeklyReportList } from "@/server/services/weekly-report-service";

export default async function StatusPage() {
  const owner = await requirePageOwner();
  const [summary, reports] = await Promise.all([
    getProgressionSummary(owner.id),
    getWeeklyReportList(owner.id),
  ]);
  return (
    <main className="app-shell">
      <div className="app-frame app-frame--wide status-page">
        <AuthenticatedHeader displayName={owner.displayName} section="SYSTEM STATUS" />
        <div className="page-heading">
          <p>SYSTEM // XP // LEVEL // RANK</p>
          <h1>STATUS</h1>
        </div>
        <ProgressionStatus initialSummary={summary} full />
        <LatestReportPanel result={reports} />
      </div>
    </main>
  );
}
