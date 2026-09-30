import Link from "next/link";

import { SystemPanel } from "@/components/system/system-panel";
import type { WeeklyReportSnapshot } from "@/server/services/weekly-report-service";

const number = (value: number | null, decimals = 1) =>
  value === null ? "—" : value.toFixed(decimals);

const movement = (value: number | null, decimals = 1) => {
  if (value === null) return "NOT AVAILABLE";
  if (value === 0) return "UNCHANGED";
  return `${value > 0 ? "UP" : "DOWN"} ${Math.abs(value).toFixed(decimals)}`;
};

export function WeeklyReportDetail({
  report,
}: {
  readonly report: WeeklyReportSnapshot;
}) {
  const week = report.period.challengeWeek;
  return (
    <div className="weekly-report-detail">
      <SystemPanel
        eyebrow={`${report.status === "PREVIEW" ? "LIVE PREVIEW" : "FINAL"} // WEEK ${week}`}
        title="ARC SCORE"
        glow
      >
        <div className="arc-score">
          <strong>{number(report.arcScore.value)}</strong>
          <span>/ 100</span>
          <b>{report.systemEvaluation.label ?? "PENDING"}</b>
          <div
            role="progressbar"
            aria-label="Arc Score"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={report.arcScore.value ?? 0}
          >
            <i style={{ width: `${report.arcScore.value ?? 0}%` }} />
          </div>
        </div>
        <p className="report-disclaimer">
          GAMIFIED CONSISTENCY ONLY — NOT A HEALTH, FITNESS, OR WEIGHT-LOSS SCORE.
        </p>
      </SystemPanel>
      <div className="report-section-grid">
        <SystemPanel eyebrow="ELAPSED CHALLENGE DAYS" title="DAILY DISCIPLINE">
          <dl className="report-metrics">
            <div>
              <dt>DISCIPLINE</dt>
              <dd>{number(report.dailyQuest.dailyDisciplinePercent)}%</dd>
            </div>
            <div>
              <dt>PERFECT DAYS</dt>
              <dd>
                {report.dailyQuest.perfectDays} / {report.dailyQuest.elapsedDays}
              </dd>
            </div>
            <div>
              <dt>RECORDED</dt>
              <dd>{report.dailyQuest.recordedDays}</dd>
            </div>
            <div>
              <dt>MISSED</dt>
              <dd>{report.dailyQuest.missedDays}</dd>
            </div>
          </dl>
        </SystemPanel>
        <SystemPanel eyebrow="NORMAL CONFIGURED TARGET" title="WORKOUT MISSION">
          <dl className="report-metrics">
            <div>
              <dt>DAYS</dt>
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
              <dt>STATE</dt>
              <dd>{report.workout.missionState}</dd>
            </div>
            <div>
              <dt>STREAK</dt>
              <dd>{report.workout.weeklyStreak}</dd>
            </div>
          </dl>
        </SystemPanel>
      </div>
      <SystemPanel eyebrow="SNAPSHOTTED ELIGIBILITY" title="DAILY RULES">
        {report.rules.length ? (
          <div className="report-rule-list">
            {report.rules.map((rule) => (
              <div key={rule.key}>
                <span>{rule.name}</span>
                <strong>
                  {rule.passed} / {rule.eligible}
                </strong>
                <b>{number(rule.compliancePercent)}%</b>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-state">NO RULE-SPECIFIC DATA</p>
        )}
      </SystemPanel>
      <SystemPanel eyebrow="DESCRIPTIVE // EXCLUDED FROM SCORE" title="WEIGHT DATA">
        <dl className="report-metrics">
          <div>
            <dt>FIRST</dt>
            <dd>{number(report.weight.firstWeightKg)} kg</dd>
          </div>
          <div>
            <dt>LAST</dt>
            <dd>{number(report.weight.lastWeightKg)} kg</dd>
          </div>
          <div>
            <dt>CHANGE</dt>
            <dd>{number(report.weight.deltaKg)} kg</dd>
          </div>
          <div>
            <dt>AVERAGE</dt>
            <dd>{number(report.weight.averageWeightKg)} kg</dd>
          </div>
          <div>
            <dt>MEASUREMENTS</dt>
            <dd>{report.weight.measurementCount}</dd>
          </div>
          <div>
            <dt>TREND</dt>
            <dd>{report.weight.isSufficientData ? "AVAILABLE" : "INSUFFICIENT DATA"}</dd>
          </div>
        </dl>
      </SystemPanel>
      {report.bodyComposition.length > 0 && (
        <SystemPanel eyebrow="MEASURED // EXCLUDED FROM SCORE" title="BODY COMPOSITION">
          <div className="report-rule-list">
            {report.bodyComposition.map((assessment) => (
              <div key={assessment.assessmentDate}>
                <span>{assessment.assessmentDate}</span>
                <strong>{assessment.percentBodyFat.toFixed(1)}% PBF</strong>
                <b>{assessment.skeletalMuscleMassKg.toFixed(1)} KG SMM</b>
              </div>
            ))}
          </div>
        </SystemPanel>
      )}
      <SystemPanel
        eyebrow="ACTIVE LEDGER // EXCLUDED FROM SCORE"
        title="SYSTEM PROGRESSION"
      >
        <dl className="report-metrics">
          <div>
            <dt>XP EARNED</dt>
            <dd>+{report.progression.xpEarned}</dd>
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
          <div>
            <dt>WEEKLY MISSION XP</dt>
            <dd>{report.progression.weeklyMissionXp}</dd>
          </div>
          <div>
            <dt>DAILY RULE XP</dt>
            <dd>{report.progression.dailyRulesXp}</dd>
          </div>
          <div>
            <dt>PERFECT DAY XP</dt>
            <dd>{report.progression.perfectDayXp}</dd>
          </div>
          <div>
            <dt>WORKOUT DAY XP</dt>
            <dd>{report.progression.workoutDayXp}</dd>
          </div>
          <div>
            <dt>LEVELS GAINED</dt>
            <dd>{report.progression.levelsGained}</dd>
          </div>
        </dl>
      </SystemPanel>
      <div className="report-section-grid">
        <SystemPanel eyebrow="ACTIVE AT REPORT TIME" title="ACHIEVEMENTS">
          {report.achievements.length ? (
            report.achievements.map((item) => (
              <p key={item.key}>
                {item.name}
                {item.titleReward ? ` // ${item.titleReward}` : ""}
              </p>
            ))
          ) : (
            <p className="empty-state">NO NEW ACHIEVEMENTS</p>
          )}
        </SystemPanel>
        <SystemPanel eyebrow="DIGITAL RECOGNITION" title="REWARDS">
          {report.rewards.items.length ? (
            <div className="report-rule-list">
              {report.rewards.items.map((item) => (
                <div key={`${item.type}:${item.grantedAt}`}>
                  <span>{item.title}</span>
                  <strong>{item.type.replaceAll("_", " ")}</strong>
                  <b>{item.grantedAt.slice(0, 10)}</b>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-state">NO NEW REWARDS</p>
          )}
        </SystemPanel>
      </div>
      <SystemPanel eyebrow="CONSTRUCTIVE // NO PENALTIES" title="RECOVERY">
        <dl className="report-metrics">
          <div>
            <dt>DAILY ACTIVATED</dt>
            <dd>{report.recovery.dailyAssigned}</dd>
          </div>
          <div>
            <dt>DAILY CLEARED</dt>
            <dd>{report.recovery.dailyCompleted}</dd>
          </div>
          <div>
            <dt>WORKOUT ACTIVATED</dt>
            <dd>{report.recovery.workoutAssigned}</dd>
          </div>
          <div>
            <dt>WORKOUT CLEARED</dt>
            <dd>{report.recovery.workoutCompleted}</dd>
          </div>
        </dl>
      </SystemPanel>
      <SystemPanel eyebrow="FACTUAL // DETERMINISTIC" title="DAILY TIMELINE">
        <div className="report-timeline">
          {report.dailyBreakdown.map((day) => (
            <div key={day.date}>
              <span>D{day.challengeDay}</span>
              <strong>{day.calendarState}</strong>
              <small>
                {day.workoutSessionCount
                  ? `${day.workoutSessionCount} WORKOUT`
                  : "NO WORKOUT"}
                {day.weightKg === null ? "" : ` // ${day.weightKg.toFixed(1)} KG`}
                {" // +"}
                {day.xpEarned} XP
              </small>
            </div>
          ))}
        </div>
      </SystemPanel>
      <SystemPanel eyebrow="NEUTRAL // PREVIOUS CHALLENGE WEEK" title="COMPARISON">
        {week === 1 ? (
          <p className="empty-state">NO PREVIOUS CHALLENGE WEEK</p>
        ) : (
          <dl className="report-metrics">
            <div>
              <dt>ARC SCORE</dt>
              <dd>{movement(report.comparison.arcScoreDelta)}</dd>
            </div>
            <div>
              <dt>DAILY DISCIPLINE</dt>
              <dd>{movement(report.comparison.dailyDisciplineDelta)} PTS</dd>
            </div>
            <div>
              <dt>PERFECT DAYS</dt>
              <dd>{movement(report.comparison.perfectDaysDelta, 0)}</dd>
            </div>
            <div>
              <dt>WORKOUT DAYS</dt>
              <dd>{movement(report.comparison.workoutDaysDelta, 0)}</dd>
            </div>
            <div>
              <dt>XP</dt>
              <dd>{movement(report.comparison.xpDelta, 0)}</dd>
            </div>
            <div>
              <dt>WEIGHT AVERAGE</dt>
              <dd>{movement(report.comparison.weightAverageDelta)} KG</dd>
            </div>
          </dl>
        )}
      </SystemPanel>
      <SystemPanel eyebrow="NO AI // SYSTEM V1" title="SYSTEM OBSERVATIONS">
        <ul className="report-observations">
          {report.systemEvaluation.observations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h3>STRONGEST RULES</h3>
        <p>
          {report.strongestRules.map((item) => item.name).join(" // ") || "NOT AVAILABLE"}
        </p>
        <h3>ATTENTION RULES</h3>
        <p>
          {report.attentionRules.map((item) => item.name).join(" // ") || "NOT AVAILABLE"}
        </p>
        <h3>NEXT WEEK FOCUS</h3>
        <ul className="report-observations">
          {report.systemEvaluation.nextWeekFocus.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </SystemPanel>
      <nav className="report-week-nav" aria-label="Report weeks">
        {week > 1 && <Link href={`/reports/week/${week - 1}`}>← PREVIOUS WEEK</Link>}
        <Link href="/reports">ALL REPORTS</Link>
        {report.period.nextAvailableWeek !== null && (
          <Link href={`/reports/week/${report.period.nextAvailableWeek}`}>
            NEXT AVAILABLE WEEK →
          </Link>
        )}
      </nav>
    </div>
  );
}
