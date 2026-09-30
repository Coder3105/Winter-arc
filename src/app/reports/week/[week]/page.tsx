import { notFound } from "next/navigation";

import { AuthenticatedHeader } from "@/components/layout/authenticated-header";
import { WeeklyReportDetail } from "@/components/reports/weekly-report-detail";
import { requirePageOwner } from "@/server/auth/request-auth";
import { AppError } from "@/server/errors/app-error";
import { getWeeklyReport } from "@/server/services/weekly-report-service";

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ week: string }>;
}) {
  const owner = await requirePageOwner();
  const { week } = await params;
  if (!/^\d+$/.test(week)) notFound();
  let result;
  try {
    result = await getWeeklyReport(owner.id, Number(week));
  } catch (error) {
    if (
      error instanceof AppError &&
      (error.code === "REPORT_NOT_AVAILABLE" || error.code === "VALIDATION_ERROR")
    )
      notFound();
    throw error;
  }
  return (
    <main className="app-shell">
      <div className="app-frame app-frame--wide">
        <AuthenticatedHeader
          displayName={owner.displayName}
          section="SYSTEM REPORT"
          active="REPORTS"
        />
        <div className="page-heading">
          <p>
            WEEK {week}
            {" // "}
            {result.kind === "AVAILABLE"
              ? `${result.report.period.weekStartDate} — ${result.report.period.weekEndDate}`
              : "UNAVAILABLE"}
          </p>
          <h1>WEEKLY EVALUATION</h1>
        </div>
        {result.kind === "AVAILABLE" ? (
          <WeeklyReportDetail report={result.report} />
        ) : (
          <p className="empty-state">{result.reason.replaceAll("_", " ")}</p>
        )}
      </div>
    </main>
  );
}
