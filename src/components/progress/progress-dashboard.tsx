"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState } from "react";

import { SystemPanel } from "@/components/system/system-panel";
import type { getWeightAnalytics } from "@/server/services/weight-service";

type Analytics = Extract<
  Awaited<ReturnType<typeof getWeightAnalytics>>,
  { readonly kind: "AVAILABLE" }
>;
type GraphRange = keyof Analytics["graph"];

const WeightChart = dynamic(
  () => import("@/components/progress/weight-chart").then((module) => module.WeightChart),
  {
    ssr: false,
    loading: () => (
      <div className="chart-loading" role="status">
        LOADING WEIGHT GRAPH…
      </div>
    ),
  },
);

function kg(value: number | null | undefined, digits = 1) {
  return value == null
    ? "—"
    : `${value.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits })} KG`;
}

function signed(value: number | null | undefined, suffix: string, digits = 1) {
  if (value == null) return "INSUFFICIENT DATA";
  const formatted = Math.abs(value).toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatted} ${suffix}`;
}

function displayDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
    .format(new Date(Date.UTC(year!, month! - 1, day!)))
    .toUpperCase();
}

function trendLabel(slope: number | null | undefined) {
  if (slope == null) return "INSUFFICIENT DATA";
  if (Math.abs(slope) < 0.01) return "STABLE TREND";
  return slope < 0 ? "DOWNWARD TREND" : "UPWARD TREND";
}

export function ProgressDashboard({ analytics }: { readonly analytics: Analytics }) {
  const [range, setRange] = useState<GraphRange>("30D");
  const graph = analytics.graph[range];
  const body = analytics.bodyComposition;
  const latestBodyIsBaseline =
    body.baseline !== null && body.latest?.id === body.baseline.id;

  return (
    <div className="progress-dashboard">
      <section className="progress-hero" aria-label="Transformation status">
        <div>
          <span>PROTOCOL</span>
          <strong>{analytics.challenge.status}</strong>
        </div>
        <div>
          <span>CHALLENGE DAY</span>
          <strong>
            {analytics.challenge.status === "ACTIVE"
              ? `${analytics.challenge.dayNumber} / ${analytics.challenge.durationDays}`
              : "—"}
          </strong>
        </div>
        <div>
          <span>DATA SOURCE</span>
          <strong>{analytics.latest?.source.replaceAll("_", " ") ?? "NO DATA"}</strong>
        </div>
      </section>

      <section className="progress-kpis" aria-label="Primary weight metrics">
        <article>
          <span>CURRENT WEIGHT</span>
          <strong>{kg(analytics.latest?.weightKg)}</strong>
          <small>
            {analytics.latest ? displayDate(analytics.latest.date) : "NO WEIGHT DATA YET"}
          </small>
        </article>
        <article>
          <span>STARTING WEIGHT</span>
          <strong>{kg(analytics.baseline?.weightKg)}</strong>
          <small>
            {analytics.baseline
              ? `BASELINE · ${displayDate(analytics.baseline.date)}`
              : "BASELINE UNAVAILABLE"}
          </small>
        </article>
        <article>
          <span>TOTAL CHANGE</span>
          <strong>{signed(analytics.change?.deltaKg, "KG")}</strong>
          <small>{analytics.change?.direction ?? "AWAITING BASELINE + CURRENT"}</small>
        </article>
        <article>
          <span>7-DAY AVERAGE</span>
          <strong>{kg(analytics.rolling7Day.averageKg)}</strong>
          <small>{analytics.rolling7Day.sampleCount} MEASUREMENTS</small>
        </article>
        <article>
          <span>WEEKLY CHANGE</span>
          <strong>{signed(analytics.weekOverWeek.deltaKg, "KG")}</strong>
          <small>
            {analytics.weekOverWeek.isSufficientData
              ? "AVERAGE VS PREVIOUS 7D"
              : "INSUFFICIENT DATA"}
          </small>
        </article>
        <article>
          <span>GOAL PROGRESS</span>
          <strong>
            {analytics.goal.clampedPercent == null
              ? "—"
              : `${analytics.goal.clampedPercent.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`}
          </strong>
          <small>{analytics.goal.status.replaceAll("_", " ")}</small>
        </article>
      </section>

      <SystemPanel
        eyebrow="SOURCE + CALCULATED // LOCAL CALENDAR"
        title="WEIGHT SIGNAL"
        glow
      >
        <div className="graph-range" role="group" aria-label="Weight graph range">
          {(["7D", "30D", "90D", "ALL"] as const).map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={range === value}
              onClick={() => setRange(value)}
            >
              {value}
            </button>
          ))}
        </div>
        {graph.length ? (
          <div className="weight-chart" aria-label={`${range} weight chart`}>
            <WeightChart
              points={graph}
              baselineWeightKg={analytics.baseline?.weightKg ?? null}
            />
          </div>
        ) : (
          <div className="progress-empty">
            <strong>NO WEIGHT DATA YET</strong>
            <p>LOG TODAY&apos;S WEIGHT TO BEGIN TRACKING</p>
          </div>
        )}
        <div className="chart-legend">
          <span>DAILY WEIGHT</span>
          <strong>7-DAY AVERAGE</strong>
          <em>BASELINE</em>
        </div>
      </SystemPanel>

      <div className="progress-two-column">
        <SystemPanel eyebrow="CALCULATED // AVERAGES" title="TREND STATUS">
          <dl className="progress-data-list">
            <div>
              <dt>7-DAY AVERAGE</dt>
              <dd>{kg(analytics.rolling7Day.averageKg)}</dd>
            </div>
            <div>
              <dt>PREVIOUS 7-DAY AVERAGE</dt>
              <dd>{kg(analytics.weekOverWeek.previousAverageKg)}</dd>
            </div>
            <div>
              <dt>WEEKLY CHANGE</dt>
              <dd>{signed(analytics.weekOverWeek.deltaKg, "KG")}</dd>
            </div>
            <div>
              <dt>RECENT TREND</dt>
              <dd>
                {analytics.trend
                  ? signed(analytics.trend.slopeKgPerWeek, "KG / WEEK", 2)
                  : "INSUFFICIENT DATA"}
              </dd>
            </div>
          </dl>
          <p className="progress-note">
            {trendLabel(analytics.trend?.slopeKgPerWeek)} · RETROSPECTIVE ESTIMATE, NOT A
            FORECAST
          </p>
        </SystemPanel>

        <SystemPanel eyebrow="CONFIGURATION // USER TARGET" title="GOAL">
          {analytics.goal.targetWeightKg === null ? (
            <div className="progress-empty progress-empty--compact">
              <strong>TARGET NOT CONFIGURED</strong>
              <Link href="/profile">CONFIGURE IN PROFILE</Link>
            </div>
          ) : (
            <div className="goal-panel">
              <span>TARGET</span>
              <strong>{kg(analytics.goal.targetWeightKg)}</strong>
              <div aria-label={`${analytics.goal.clampedPercent ?? 0}% goal progress`}>
                <i style={{ width: `${analytics.goal.clampedPercent ?? 0}%` }} />
              </div>
              <small>
                RAW PROGRESS{" "}
                {analytics.goal.rawPercent?.toLocaleString("en-US", {
                  maximumFractionDigits: 1,
                }) ?? "—"}
                %
              </small>
            </div>
          )}
        </SystemPanel>
      </div>

      <SystemPanel eyebrow="MEASURED // INBODY" title="BODY COMPOSITION" glow>
        {body.baseline ? (
          <>
            <div className="composition-compare">
              <article>
                <span>BASELINE</span>
                <strong>{displayDate(body.baseline.date)}</strong>
                <small>{body.baseline.source.toUpperCase()}</small>
              </article>
              <b>→</b>
              <article>
                <span>LATEST ASSESSMENT</span>
                <strong>{body.latest ? displayDate(body.latest.date) : "—"}</strong>
                <small>{body.latest?.source.toUpperCase() ?? "NOT AVAILABLE"}</small>
              </article>
            </div>
            {latestBodyIsBaseline ? (
              <div className="progress-empty progress-empty--compact">
                <strong>NEXT BODY-COMPOSITION ASSESSMENT REQUIRED FOR COMPARISON</strong>
              </div>
            ) : body.latest && body.comparison ? (
              <div className="composition-metrics">
                <div>
                  <span>WEIGHT</span>
                  <strong>{kg(body.latest.measurements.weightKg)}</strong>
                  <small>{signed(body.comparison.weightDeltaKg, "KG")}</small>
                </div>
                <div>
                  <span>BODY FAT</span>
                  <strong>{body.latest.measurements.percentBodyFat.toFixed(1)}%</strong>
                  <small>
                    {signed(body.comparison.bodyFatPercentDeltaPoints, "POINTS")}
                  </small>
                </div>
                <div>
                  <span>FAT MASS</span>
                  <strong>{kg(body.latest.measurements.bodyFatMassKg)}</strong>
                  <small>{signed(body.comparison.bodyFatMassDeltaKg, "KG")}</small>
                </div>
                <div>
                  <span>SKELETAL MUSCLE</span>
                  <strong>{kg(body.latest.measurements.skeletalMuscleMassKg)}</strong>
                  <small>{signed(body.comparison.skeletalMuscleMassDeltaKg, "KG")}</small>
                </div>
                <div>
                  <span>FAT-FREE MASS</span>
                  <strong>{kg(body.latest.measurements.fatFreeMassKg)}</strong>
                  <small>{signed(body.comparison.fatFreeMassDeltaKg, "KG")}</small>
                </div>
                <div>
                  <span>VISCERAL FAT</span>
                  <strong>{body.latest.measurements.visceralFatLevel}</strong>
                  <small>{signed(body.comparison.visceralFatLevelDelta, "LEVELS")}</small>
                </div>
              </div>
            ) : null}
            <div className="assessment-history">
              <div>
                <span>DATE</span>
                <span>SOURCE</span>
                <span>WEIGHT</span>
                <span>BODY FAT</span>
              </div>
              {body.history.map((assessment) => (
                <div key={assessment.id}>
                  <strong>{displayDate(assessment.date)}</strong>
                  <span>{assessment.source.toUpperCase()}</span>
                  <span>{kg(assessment.measurements.weightKg)}</span>
                  <span>{assessment.measurements.percentBodyFat.toFixed(1)}%</span>
                </div>
              ))}
            </div>
            <p className="progress-note">
              BODY-COMPOSITION VALUES ARE MEASURED ASSESSMENT DATA. DAILY WEIGHT DOES NOT
              INTERPOLATE BODY FAT OR MUSCLE.
            </p>
          </>
        ) : (
          <div className="progress-empty">
            <strong>BASELINE ASSESSMENT UNAVAILABLE</strong>
          </div>
        )}
      </SystemPanel>
    </div>
  );
}
