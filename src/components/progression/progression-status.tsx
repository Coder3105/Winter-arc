"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { SystemEvent, type SystemEventData } from "@/components/system/system-event";
import { SystemPanel } from "@/components/system/system-panel";
import { redirectExpiredSession } from "@/lib/auth/client-session";
import type { ProgressionSummary } from "@/server/services/progression-service";

function formatXp(value: number) {
  return value.toLocaleString("en-US");
}

export function notifyProgressionUpdated() {
  window.dispatchEvent(new Event("progression:updated"));
}

export function ProgressionStatus({
  initialSummary,
  full = false,
}: {
  readonly initialSummary: ProgressionSummary;
  readonly full?: boolean;
}) {
  const [summary, setSummary] = useState(initialSummary);
  const summaryRef = useRef(initialSummary);
  const [systemEvent, setSystemEvent] = useState<SystemEventData | null>(null);
  const dismissSystemEvent = useCallback(() => setSystemEvent(null), []);

  useEffect(() => {
    async function refresh() {
      const response = await fetch("/api/v1/progression", { cache: "no-store" });
      if (redirectExpiredSession(response)) return;
      const payload = (await response.json()) as {
        success: boolean;
        data?: ProgressionSummary;
      };
      if (response.ok && payload.success && payload.data) {
        const previous = summaryRef.current;
        const next = payload.data;
        if (previous.kind === "AVAILABLE" && next.kind === "AVAILABLE") {
          const xpDelta = next.totalXp - previous.totalXp;
          const levelAdvanced = next.level.current > previous.level.current;
          const rankAdvanced = next.rank.current !== previous.rank.current;
          const achievementUnlocked =
            next.systemRecord.achievementCount > previous.systemRecord.achievementCount;

          if (xpDelta > 0 || levelAdvanced || rankAdvanced || achievementUnlocked) {
            const title = rankAdvanced
              ? `RANK ${next.rank.current}`
              : levelAdvanced
                ? `LEVEL ${next.level.current}`
                : achievementUnlocked
                  ? (next.systemRecord.latestAchievement?.name ?? "ACHIEVEMENT UNLOCKED")
                  : `+${xpDelta} XP`;
            const detail = [
              xpDelta > 0 ? `+${xpDelta} XP` : null,
              levelAdvanced ? `LEVEL ${next.level.current}` : null,
              achievementUnlocked && next.systemRecord.latestAchievement
                ? next.systemRecord.latestAchievement.name
                : null,
            ]
              .filter(Boolean)
              .join(" // ");
            setSystemEvent({
              id: `${next.totalXp}-${next.level.current}-${next.rank.current}-${next.systemRecord.achievementCount}`,
              eyebrow: rankAdvanced
                ? "RANK ADVANCEMENT"
                : levelAdvanced
                  ? "SYSTEM ADVANCEMENT"
                  : achievementUnlocked
                    ? "ACHIEVEMENT UNLOCKED"
                    : "SYSTEM XP",
              title,
              detail,
              accent:
                rankAdvanced || levelAdvanced
                  ? "ADVANCEMENT"
                  : achievementUnlocked
                    ? "ACHIEVEMENT"
                    : "STANDARD",
              ...(achievementUnlocked
                ? {
                    actionHref: "/achievements",
                    actionLabel: "VIEW ACHIEVEMENTS",
                  }
                : {}),
            });
          }
        }
        summaryRef.current = next;
        setSummary(next);
      }
    }
    window.addEventListener("progression:updated", refresh);
    return () => window.removeEventListener("progression:updated", refresh);
  }, []);

  if (summary.kind === "UNAVAILABLE") {
    return (
      <SystemPanel eyebrow="SYSTEM // OFFLINE" title="SYSTEM STATUS">
        <div className="progression-unavailable">
          <strong>{summary.reason.replaceAll("_", " ")}</strong>
          <p>XP begins when the owner profile and active Winter Arc are configured.</p>
        </div>
      </SystemPanel>
    );
  }

  const content = (
    <SystemPanel eyebrow="GAMIFICATION // WINTER ARC" title="SYSTEM STATUS" glow>
      <div className="progression-identity">
        <div>
          <span>LEVEL</span>
          <strong>{summary.level.current}</strong>
        </div>
        <div>
          <span>RANK</span>
          <strong>{summary.rank.current}</strong>
        </div>
        <div>
          <span>TOTAL XP</span>
          <strong>{formatXp(summary.totalXp)}</strong>
        </div>
      </div>
      {summary.systemRecord.selectedTitle && (
        <p className="progression-title">TITLE // {summary.systemRecord.selectedTitle}</p>
      )}
      <div className="progression-level-bar">
        <div
          role="progressbar"
          aria-label={`Level ${summary.level.current} progress`}
          aria-valuemin={0}
          aria-valuemax={summary.level.xpRequired}
          aria-valuenow={summary.level.xpIntoLevel}
        >
          <span style={{ width: `${summary.level.progressPercent}%` }} />
        </div>
        <p>
          <strong>{formatXp(summary.level.xpIntoLevel)}</strong> /{" "}
          {formatXp(summary.level.xpRequired)} XP
        </p>
      </div>
      {!full && <span className="progression-open">OPEN SYSTEM STATUS →</span>}
    </SystemPanel>
  );

  if (!full)
    return (
      <>
        <Link className="progression-status-link" href="/status">
          {content}
        </Link>
        <SystemEvent event={systemEvent} onDismiss={dismissSystemEvent} />
      </>
    );

  return (
    <div className="progression-dashboard">
      <SystemEvent event={systemEvent} onDismiss={dismissSystemEvent} />
      {content}
      <div className="progression-next-grid">
        <SystemPanel eyebrow="NEXT // LEVEL" title={`LEVEL ${summary.level.nextLevel}`}>
          <strong className="progression-next-value">
            {formatXp(summary.level.xpRemaining)} XP REMAINING
          </strong>
        </SystemPanel>
        <SystemPanel eyebrow="NEXT // RANK" title={summary.rank.next ?? "S+"}>
          <strong className="progression-next-value">
            {summary.rank.levelsUntilNextRank === null
              ? "HIGHEST SYSTEM RANK"
              : `${summary.rank.levelsUntilNextRank} LEVEL${summary.rank.levelsUntilNextRank === 1 ? "" : "S"} REMAINING`}
          </strong>
        </SystemPanel>
      </div>
      <div className="progression-next-grid">
        <SystemPanel eyebrow="SYSTEM RECORD" title="ACHIEVEMENTS">
          <strong className="progression-next-value">
            {summary.systemRecord.achievementCount} UNLOCKED
          </strong>
          <p>{summary.systemRecord.latestAchievement?.name ?? "NO ACHIEVEMENTS YET"}</p>
          <Link className="system-status-action" href="/achievements">
            OPEN ACHIEVEMENTS →
          </Link>
        </SystemPanel>
        <SystemPanel eyebrow="SYSTEM RECORD" title="REWARDS">
          <strong className="progression-next-value">
            {summary.systemRecord.dailyClearCount} DAILY CLEARS
          </strong>
          <p>
            {summary.systemRecord.perfectWeekCount} perfect weeks //{" "}
            {summary.systemRecord.weeklyMissionRewardCount} weekly missions
          </p>
          <Link className="system-status-action" href="/rewards">
            OPEN REWARDS →
          </Link>
        </SystemPanel>
      </div>
      {summary.systemRecord.activeRecovery.length > 0 && (
        <SystemPanel eyebrow="CONSTRUCTIVE // NO PENALTIES" title="RECOVERY MODE">
          <p>
            {summary.systemRecord.activeRecovery.length} active recovery protocol
            {summary.systemRecord.activeRecovery.length === 1 ? "" : "s"}. Resume the
            normal protocol to clear them.
          </p>
        </SystemPanel>
      )}
      <SystemPanel eyebrow="ACTIVE LEDGER" title="PROGRESSION SOURCES">
        <dl className="progression-breakdown">
          <div>
            <dt>DAILY QUESTS</dt>
            <dd>{formatXp(summary.breakdown.dailyRules)} XP</dd>
          </div>
          <div>
            <dt>PERFECT DAYS</dt>
            <dd>{formatXp(summary.breakdown.perfectDays)} XP</dd>
          </div>
          <div>
            <dt>WORKOUT DAYS</dt>
            <dd>{formatXp(summary.breakdown.workoutDays)} XP</dd>
          </div>
          <div>
            <dt>WEEKLY MISSIONS</dt>
            <dd>{formatXp(summary.breakdown.weeklyWorkoutBonuses)} XP</dd>
          </div>
        </dl>
      </SystemPanel>
      <SystemPanel eyebrow="LAST 12 ACTIVE EVENTS" title="RECENT ACTIVITY">
        {summary.recentEvents.length ? (
          <div className="progression-events">
            {summary.recentEvents.map((event, index) => (
              <article key={`${event.eventType}-${event.sourceDate}-${index}`}>
                <div>
                  <strong>{event.label}</strong>
                  <span>
                    {event.challengeDay
                      ? `DAY ${event.challengeDay}`
                      : `WEEK ${event.challengeWeek}`}
                  </span>
                </div>
                <b>+{event.xp} XP</b>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">NO ACTIVE XP EVENTS YET</p>
        )}
      </SystemPanel>
      <p className="progression-disclaimer">
        LEVEL AND RANK REPRESENT WINTER ARC GAMIFICATION ONLY — NOT HEALTH OR FITNESS
        QUALITY.
      </p>
    </div>
  );
}

export function ProgressionIdentity({
  summary,
}: {
  readonly summary: ProgressionSummary;
}) {
  if (summary.kind === "UNAVAILABLE") return null;
  return (
    <SystemPanel eyebrow="GAMIFICATION // IDENTITY" title="SYSTEM IDENTITY">
      <dl className="detail-list detail-list--columns">
        <div>
          <dt>LEVEL</dt>
          <dd>{summary.level.current}</dd>
        </div>
        <div>
          <dt>RANK</dt>
          <dd>{summary.rank.current}</dd>
        </div>
        <div>
          <dt>TOTAL XP</dt>
          <dd>{formatXp(summary.totalXp)}</dd>
        </div>
        <div>
          <dt>TITLE</dt>
          <dd>{summary.systemRecord.selectedTitle ?? "UNASSIGNED"}</dd>
        </div>
      </dl>
      <Link className="system-status-action" href="/status">
        VIEW SYSTEM STATUS →
      </Link>
    </SystemPanel>
  );
}
