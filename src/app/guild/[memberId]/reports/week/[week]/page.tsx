import Link from "next/link";
import { Avatar } from "@/components/profile/avatar";
import { notFound } from "next/navigation";

import { AuthenticatedHeader } from "@/components/layout/authenticated-header";
import { SystemPanel } from "@/components/system/system-panel";
import { requirePageOwner } from "@/server/auth/request-auth";
import { AppError } from "@/server/errors/app-error";
import { validateGuildId } from "@/server/guild/guild-route";
import { getGuildMemberReportProjection } from "@/server/services/guild-projection-service";

export default async function GuildReportDetailPage({
  params,
}: {
  readonly params: Promise<{ memberId: string; week: string }>;
}) {
  const owner = await requirePageOwner();
  const { memberId: rawMemberId, week } = await params;
  if (!/^\d+$/.test(week)) notFound();
  let memberId: string;
  try {
    memberId = validateGuildId(rawMemberId);
  } catch {
    notFound();
  }
  let result;
  try {
    result = await getGuildMemberReportProjection(owner.id, memberId, Number(week));
  } catch (error) {
    if (
      error instanceof AppError &&
      [
        "GUILD_ACCESS_DENIED",
        "GUILD_MEMBER_NOT_FOUND",
        "GUILD_SHARING_DISABLED",
        "REPORT_NOT_AVAILABLE",
        "VALIDATION_ERROR",
      ].includes(error.code)
    ) {
      notFound();
    }
    throw error;
  }
  if (result.kind !== "AVAILABLE") notFound();
  const { report } = result;
  return (
    <main className="app-shell">
      <div className="app-frame app-frame--wide guild-page">
        <AuthenticatedHeader
          displayName={owner.displayName}
          section="GUILD REPORT"
          active="GUILD"
        />
        <div className="page-heading">
          <Avatar avatarKey={result.member.avatarKey} size={48} />
          <p>
            {result.member.displayName}
            {" // WEEK "}
            {week}
          </p>
          <h1>WEEKLY EVALUATION</h1>
        </div>
        <div className="guild-report-detail">
          <SystemPanel
            eyebrow={`ARC SCORE // ${report.status}`}
            title={report.systemEvaluation.label ?? "PENDING"}
            glow
          >
            <div className="history-metrics">
              <div>
                <span>ARC SCORE</span>
                <strong>
                  {report.arcScore.value === null
                    ? "—"
                    : report.arcScore.value.toFixed(0)}
                </strong>
              </div>
              <div>
                <span>DISCIPLINE</span>
                <strong>
                  {report.dailyQuest.dailyDisciplinePercent === null
                    ? "—"
                    : `${report.dailyQuest.dailyDisciplinePercent.toFixed(0)}%`}
                </strong>
              </div>
              <div>
                <span>PERFECT DAYS</span>
                <strong>{report.dailyQuest.perfectDays}</strong>
              </div>
              <div>
                <span>MISSED DAYS</span>
                <strong>{report.dailyQuest.missedDays}</strong>
              </div>
            </div>
          </SystemPanel>
          <SystemPanel eyebrow="NON-PRIVATE RULES // COMPLIANCE" title="DAILY DISCIPLINE">
            {report.rules.length ? (
              <div className="streak-table guild-rule-table">
                <div className="streak-table__header">
                  <span>RULE</span>
                  <span>PASS</span>
                  <span>RATE</span>
                </div>
                {report.rules.map((rule) => (
                  <div key={rule.key}>
                    <strong>{rule.name}</strong>
                    <span>{rule.passed}</span>
                    <span>
                      {rule.compliancePercent === null
                        ? "—"
                        : `${rule.compliancePercent.toFixed(0)}%`}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-state">NO RULE DETAILS SHARED</p>
            )}
          </SystemPanel>
          {"workout" in report ? (
            <SystemPanel eyebrow="TRAINING // SUMMARY ONLY" title="WORKOUT MISSION">
              <dl className="detail-list detail-list--columns">
                <div>
                  <dt>MISSION</dt>
                  <dd>{report.workout.missionState}</dd>
                </div>
                <div>
                  <dt>DISTINCT DAYS</dt>
                  <dd>
                    {report.workout.completedWorkoutDays} /{" "}
                    {report.workout.requiredWorkoutDays}
                  </dd>
                </div>
                <div>
                  <dt>SESSIONS</dt>
                  <dd>{report.workout.totalWorkoutSessions}</dd>
                </div>
                <div>
                  <dt>WEEKLY STREAK</dt>
                  <dd>{report.workout.weeklyStreak}</dd>
                </div>
              </dl>
            </SystemPanel>
          ) : null}
          {"progression" in report ? (
            <SystemPanel eyebrow="SYSTEM // PROGRESSION" title="XP & RANK">
              <dl className="detail-list detail-list--columns">
                <div>
                  <dt>XP EARNED</dt>
                  <dd>{report.progression.xpEarned}</dd>
                </div>
                <div>
                  <dt>LEVEL</dt>
                  <dd>
                    {report.progression.startingLevel} → {report.progression.endingLevel}
                  </dd>
                </div>
                <div>
                  <dt>RANK</dt>
                  <dd>
                    {report.progression.startingRank} → {report.progression.endingRank}
                  </dd>
                </div>
              </dl>
            </SystemPanel>
          ) : null}
          {"weight" in report ? (
            <SystemPanel eyebrow="EXPLICITLY SHARED" title="WEIGHT">
              <dl className="detail-list detail-list--columns">
                <div>
                  <dt>WEEKLY AVERAGE</dt>
                  <dd>
                    {report.weight.averageWeightKg === null
                      ? "INSUFFICIENT DATA"
                      : `${report.weight.averageWeightKg.toFixed(1)} kg`}
                  </dd>
                </div>
                <div>
                  <dt>MEASUREMENTS</dt>
                  <dd>{report.weight.measurementCount}</dd>
                </div>
              </dl>
            </SystemPanel>
          ) : null}
          {"bodyComposition" in report ? (
            <SystemPanel eyebrow="EXPLICITLY SHARED" title="BODY COMPOSITION">
              {report.bodyComposition.length ? (
                <div className="guild-assessment-list">
                  {report.bodyComposition.map((assessment) => (
                    <div key={assessment.assessmentDate}>
                      <strong>{assessment.assessmentDate}</strong>
                      <span>{assessment.percentBodyFat}% BODY FAT</span>
                      <span>{assessment.skeletalMuscleMassKg} kg SMM</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-state">NO ASSESSMENT THIS WEEK</p>
              )}
            </SystemPanel>
          ) : null}
        </div>
        <Link
          className="system-status-action guild-back-link"
          href={`/guild/${memberId}/reports`}
        >
          ← RETURN TO REPORTS
        </Link>
      </div>
    </main>
  );
}
