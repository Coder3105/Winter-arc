import Link from "next/link";

import { SystemPanel } from "@/components/system/system-panel";
import type { WeeklyReportListResult } from "@/server/services/weekly-report-service";

function score(value: number | null) {
  return value === null ? "—" : value.toFixed(1);
}

export function ReportList({ result }: { readonly result: WeeklyReportListResult }) {
  if (result.kind === "UNAVAILABLE")
    return (
      <SystemPanel eyebrow="REPORTS // OFFLINE" title="WEEKLY REPORTS">
        <p className="empty-state">{result.reason.replaceAll("_", " ")}</p>
      </SystemPanel>
    );
  const items = [...(result.current ? [result.current] : []), ...result.finalized];
  if (!items.length)
    return (
      <SystemPanel eyebrow="SYSTEM // WEEKLY" title="WEEKLY REPORTS">
        <p className="empty-state">NO REPORTS AVAILABLE YET</p>
      </SystemPanel>
    );
  return (
    <div className="report-list">
      {items.map((item) => (
        <SystemPanel
          key={item.challengeWeek}
          eyebrow={
            item.status === "PREVIEW" ? "CURRENT WEEK // LIVE PREVIEW" : "FINAL REPORT"
          }
          title={`WEEK ${String(item.challengeWeek).padStart(2, "0")}`}
          glow={item.status === "PREVIEW"}
        >
          <div className="report-card-score">
            <span>ARC SCORE</span>
            <strong>{score(item.arcScore)}</strong>
            <b>{item.evaluation ?? "PENDING"}</b>
          </div>
          <dl className="report-card-metrics">
            <div>
              <dt>PERFECT DAYS</dt>
              <dd>
                {item.perfectDays} / {item.elapsedDays}
              </dd>
            </div>
            <div>
              <dt>WORKOUT</dt>
              <dd>
                {item.workoutDays} / {item.requiredWorkoutDays}
              </dd>
            </div>
            <div>
              <dt>XP EARNED</dt>
              <dd>+{item.xpEarned}</dd>
            </div>
          </dl>
          <Link
            className="system-status-action"
            href={`/reports/week/${item.challengeWeek}`}
          >
            VIEW REPORT →
          </Link>
        </SystemPanel>
      ))}
    </div>
  );
}

export function LatestReportPanel({
  result,
}: {
  readonly result: WeeklyReportListResult;
}) {
  if (result.kind === "UNAVAILABLE") return null;
  const latest = result.current ?? result.finalized[0] ?? null;
  return (
    <SystemPanel eyebrow="SYSTEM // WEEKLY EVALUATION" title="LATEST REPORT">
      {latest ? (
        <>
          <dl className="report-card-metrics">
            <div>
              <dt>WEEK</dt>
              <dd>{latest.challengeWeek}</dd>
            </div>
            <div>
              <dt>ARC SCORE</dt>
              <dd>{score(latest.arcScore)}</dd>
            </div>
            <div>
              <dt>EVALUATION</dt>
              <dd>{latest.evaluation ?? "PENDING"}</dd>
            </div>
          </dl>
          <Link
            className="system-status-action"
            href={`/reports/week/${latest.challengeWeek}`}
          >
            VIEW REPORT →
          </Link>
        </>
      ) : (
        <p className="empty-state">NO REPORT AVAILABLE YET</p>
      )}
    </SystemPanel>
  );
}
