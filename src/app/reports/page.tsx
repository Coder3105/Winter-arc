import { AuthenticatedHeader } from "@/components/layout/authenticated-header";
import { ReportList } from "@/components/reports/report-list";
import { requirePageOwner } from "@/server/auth/request-auth";
import { getWeeklyReportList } from "@/server/services/weekly-report-service";

export default async function ReportsPage() {
  const owner = await requirePageOwner();
  const result = await getWeeklyReportList(owner.id);
  return (
    <main className="app-shell">
      <div className="app-frame app-frame--wide">
        <AuthenticatedHeader
          displayName={owner.displayName}
          section="WEEKLY REPORTS"
          active="REPORTS"
        />
        <div className="page-heading">
          <p>SYSTEM // WEEKLY EVALUATION</p>
          <h1>WEEKLY REPORTS</h1>
        </div>
        <ReportList result={result} />
      </div>
    </main>
  );
}
