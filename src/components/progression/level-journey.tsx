"use client";

import { useState } from "react";

import { ShadowPortrait } from "@/components/system/shadow-portrait";
import {
  LEVEL_REWARD_MILESTONES,
  rankForJourneyLevel,
  xpRequiredForLevel,
} from "@/lib/progression/level-rewards";

export function LevelJourney({
  currentLevel,
  progressPercent,
}: {
  readonly currentLevel: number;
  readonly progressPercent: number;
}) {
  const [openReward, setOpenReward] = useState<number | null>(null);
  const lastLevel = Math.max(30, currentLevel + 1);

  return (
    <section className="level-journey" aria-labelledby="level-journey-title">
      <header>
        <div>
          <span>SYSTEM // ASCENSION ROUTE</span>
          <h2 id="level-journey-title">LEVEL PATH</h2>
        </div>
        <p>SELECT A SHADOW REWARD TO INSPECT ITS MILESTONE.</p>
      </header>
      <div className="level-journey__track">
        {Array.from({ length: lastLevel }, (_, index) => index + 1).map((level) => {
          const milestone = LEVEL_REWARD_MILESTONES.find(
            (reward) => reward.level === level,
          );
          const state =
            level < currentLevel
              ? "REACHED"
              : level === currentLevel
                ? "CURRENT"
                : level === currentLevel + 1
                  ? "NEXT"
                  : "LOCKED";
          const expanded = openReward === level;
          return (
            <article
              className={`level-journey__node level-journey__node--${state.toLowerCase()}${milestone ? " level-journey__node--reward" : ""}`}
              key={level}
            >
              <div className="level-journey__level">
                <small>LEVEL</small>
                <strong>{level}</strong>
              </div>
              <div className="level-journey__copy">
                <strong>
                  RANK {rankForJourneyLevel(level)}
                  {" // "}
                  {state}
                </strong>
                <span>
                  {level === currentLevel
                    ? `${progressPercent.toFixed(1)}% TO LEVEL ${level + 1}`
                    : `${xpRequiredForLevel(level).toLocaleString("en-US")} TOTAL XP`}
                </span>
              </div>
              {milestone ? (
                <div className="level-journey__reward">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={`level-reward-${level}`}
                    aria-label={`Inspect reward at level ${level}`}
                    onClick={() => setOpenReward(expanded ? null : level)}
                  >
                    <ShadowPortrait soldier={milestone.soldier} size={54} />
                    <span>{level <= currentLevel ? "EARNED" : "REWARD"}</span>
                  </button>
                  {expanded ? (
                    <div
                      className="level-journey__reward-popover"
                      id={`level-reward-${level}`}
                      role="status"
                    >
                      <ShadowPortrait soldier={milestone.soldier} size={74} />
                      <div>
                        <small>
                          LEVEL {level}
                          {" // "}
                          DIGITAL RECOGNITION
                        </small>
                        <strong>{milestone.title}</strong>
                        <p>{milestone.description}</p>
                        <b>{level <= currentLevel ? "UNLOCKED" : "LOCKED"}</b>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
