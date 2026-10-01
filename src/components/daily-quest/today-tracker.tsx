"use client";

import { useState } from "react";

import { SystemPanel } from "@/components/system/system-panel";
import { notifyProgressionUpdated } from "@/components/progression/progression-status";
import { redirectExpiredSession } from "@/lib/auth/client-session";
import { getDailyRuleXp, PERFECT_DAY_XP } from "@/lib/progression/xp-policy";
import type {
  EvaluatedDailyQuest,
  EvaluatedDailyQuestRule,
} from "@/server/daily-quest/evaluation";
import type { DailyQuestUnavailableReason } from "@/server/services/daily-quest-service";
import type {
  WeightDto,
  WeightUnavailableReason,
} from "@/server/services/weight-service";

type InitialResult =
  | { readonly kind: "AVAILABLE"; readonly quest: EvaluatedDailyQuest }
  | {
      readonly kind: "UNAVAILABLE";
      readonly reason: DailyQuestUnavailableReason;
      readonly localDate: string | null;
    };

type InitialWeightResult =
  | {
      readonly kind: "AVAILABLE";
      readonly localDate: string;
      readonly weight: WeightDto | null;
    }
  | { readonly kind: "UNAVAILABLE"; readonly reason: WeightUnavailableReason };

const UNAVAILABLE_COPY: Record<DailyQuestUnavailableReason, string> = {
  WINTER_ARC_NOT_ACTIVE: "ACTIVATE YOUR WINTER ARC IN SETUP",
  PROFILE_REQUIRED: "COMPLETE OWNER PROFILE SETUP",
  PROTOCOL_NOT_STARTED: "PROTOCOL NOT STARTED",
  WINTER_ARC_COMPLETE: "WINTER ARC COMPLETE",
};

function displayNumber(value: number, maximumFractionDigits = 2) {
  return value.toLocaleString("en-US", { maximumFractionDigits });
}

function RuleState({ state }: { readonly state: EvaluatedDailyQuestRule["state"] }) {
  return (
    <span className={`quest-state quest-state--${state.toLowerCase()}`}>
      {state.replaceAll("_", " ")}
    </span>
  );
}

export function TodayTracker({
  initialResult,
  initialWeightResult,
}: {
  readonly initialResult: InitialResult;
  readonly initialWeightResult: InitialWeightResult;
}) {
  const [quest, setQuest] = useState(
    initialResult.kind === "AVAILABLE" ? initialResult.quest : null,
  );
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [weight, setWeight] = useState(
    initialWeightResult.kind === "AVAILABLE" ? initialWeightResult.weight : null,
  );
  const [weightInput, setWeightInput] = useState(
    initialWeightResult.kind === "AVAILABLE" && initialWeightResult.weight
      ? String(initialWeightResult.weight.weightKg)
      : "",
  );
  const [weightPending, setWeightPending] = useState(false);

  if (!quest) {
    const reason =
      initialResult.kind === "UNAVAILABLE"
        ? initialResult.reason
        : "WINTER_ARC_NOT_ACTIVE";
    return (
      <SystemPanel eyebrow="QUEST // UNAVAILABLE" title="DAILY QUEST" glow>
        <div className="quest-unavailable">
          <strong>{UNAVAILABLE_COPY[reason]}</strong>
          <p>Daily Quest records are created only during an active protocol day.</p>
        </div>
      </SystemPanel>
    );
  }

  async function updateRule(key: string, value: boolean | number) {
    if (pendingKey) return;
    setPendingKey(key);
    setMessage(null);
    try {
      const response = await fetch("/api/v1/daily-quest/today", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      if (redirectExpiredSession(response)) return;
      const payload = (await response.json()) as {
        success: boolean;
        data?: { quest?: EvaluatedDailyQuest };
        error?: { message?: string };
      };
      if (!response.ok || !payload.success || !payload.data?.quest) {
        throw new Error(payload.error?.message ?? "Daily Quest update failed.");
      }
      setQuest(payload.data.quest);
      notifyProgressionUpdated();
      setMessage("SAVED");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Daily Quest update failed.");
    } finally {
      setPendingKey(null);
    }
  }

  async function saveWeight() {
    const value = Number(weightInput);
    if (!Number.isFinite(value) || value < 20 || value > 500) {
      setMessage("ENTER A WEIGHT FROM 20 TO 500 KG");
      return;
    }
    setWeightPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/v1/weights/today", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ weightKg: value }),
      });
      if (redirectExpiredSession(response)) return;
      const payload = (await response.json()) as {
        success: boolean;
        data?: { weight?: WeightDto; quest?: EvaluatedDailyQuest };
        error?: { message?: string };
      };
      if (
        !response.ok ||
        !payload.success ||
        !payload.data?.weight ||
        !payload.data.quest
      )
        throw new Error(payload.error?.message ?? "Weight save failed.");
      setWeight(payload.data.weight);
      setWeightInput(String(payload.data.weight.weightKg));
      setQuest(payload.data.quest);
      notifyProgressionUpdated();
      setMessage("WEIGHT LOGGED");
    } catch (error) {
      setWeightInput(weight ? String(weight.weightKg) : "");
      setMessage(error instanceof Error ? error.message : "Weight save failed.");
    } finally {
      setWeightPending(false);
    }
  }

  async function removeWeight() {
    if (!weight || !window.confirm("Remove today's weight entry?")) return;
    setWeightPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/v1/weights/today", { method: "DELETE" });
      if (redirectExpiredSession(response)) return;
      const payload = (await response.json()) as {
        success: boolean;
        data?: { quest?: EvaluatedDailyQuest };
        error?: { message?: string };
      };
      if (!response.ok || !payload.success || !payload.data?.quest)
        throw new Error(payload.error?.message ?? "Weight removal failed.");
      setWeight(null);
      setWeightInput("");
      setQuest(payload.data.quest);
      notifyProgressionUpdated();
      setMessage("WEIGHT REMOVED");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Weight removal failed.");
    } finally {
      setWeightPending(false);
    }
  }

  const progress = quest.completionPercent ?? 0;

  return (
    <div className="today-tracker">
      <section
        className="quest-overview"
        aria-label="Daily Quest progress"
        data-focus-card
      >
        <div>
          <span>WINTER ARC</span>
          <strong>
            DAY {quest.challengeDay} / {quest.durationDays}
          </strong>
        </div>
        <div>
          <span>CHALLENGE WEEK</span>
          <strong>{quest.challengeWeek}</strong>
        </div>
        <div>
          <span>QUEST STATUS</span>
          <strong>{quest.status.replaceAll("_", " ")}</strong>
        </div>
      </section>

      <SystemPanel eyebrow="SOURCE DATA // TODAY" title="MORNING WEIGHT" glow>
        <div className="today-weight">
          <div className="today-weight__status">
            <div>
              <span>CANONICAL DAILY WEIGHT</span>
              <strong>
                {weight ? `${displayNumber(weight.weightKg, 1)} KG` : "NOT RECORDED"}
              </strong>
            </div>
            <RuleState state={weight ? "PASS" : "NOT_RECORDED"} />
          </div>
          <p className={weight ? "quest-xp is-earned" : "quest-xp"}>+5 XP</p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void saveWeight();
            }}
          >
            <label>
              <span className="sr-only">Weight in kilograms</span>
              <input
                type="number"
                min="20"
                max="500"
                step="0.01"
                inputMode="decimal"
                value={weightInput}
                onChange={(event) => setWeightInput(event.target.value)}
                placeholder="108.6"
                disabled={weightPending}
              />
              <b>KG</b>
            </label>
            <button type="submit" disabled={weightPending || !weightInput}>
              {weightPending ? "SAVING…" : weight ? "UPDATE" : "LOG WEIGHT"}
            </button>
            {weight && (
              <button
                type="button"
                className="today-weight__remove"
                disabled={weightPending}
                onClick={() => void removeWeight()}
              >
                REMOVE
              </button>
            )}
          </form>
          <p>Recorded time is preserved when today’s value is corrected.</p>
        </div>
      </SystemPanel>

      <SystemPanel
        eyebrow={`${quest.completedRequiredRules} / ${quest.totalRequiredRules} TASKS COMPLETE`}
        title="DAILY QUEST"
        glow
      >
        <div
          className="quest-progress"
          data-focus-card
          aria-label={`${displayNumber(progress, 1)} percent complete`}
        >
          <div>
            <span style={{ width: `${progress}%` }} />
          </div>
          <strong>{displayNumber(progress, 1)}%</strong>
        </div>

        <div className="quest-list">
          {quest.rules
            .filter((rule) => rule.key !== "morning_weight")
            .map((rule) => {
              const isPending = pendingKey === rule.key;
              const booleanRule =
                rule.type === "BOOLEAN" || rule.type === "LOGGING_REQUIREMENT";
              return (
                <article className="quest-rule" key={rule.key} data-focus-card>
                  <div className="quest-rule__heading">
                    <div>
                      <h2>{rule.name}</h2>
                      <span
                        className={`quest-xp${rule.state === "PASS" ? " is-earned" : ""}`}
                      >
                        +{getDailyRuleXp(rule.key)} XP
                      </span>
                      {rule.target !== null && (
                        <p>
                          {rule.actual === null
                            ? "—"
                            : displayNumber(rule.actual as number)}{" "}
                          / {displayNumber(rule.target)} {rule.unit?.toUpperCase()}
                        </p>
                      )}
                    </div>
                    <RuleState state={rule.state} />
                  </div>

                  {booleanRule ? (
                    <div className="quest-actions quest-actions--binary">
                      <button
                        type="button"
                        className={rule.actual === true ? "is-selected is-pass" : ""}
                        onClick={() => void updateRule(rule.key, true)}
                        disabled={pendingKey !== null}
                        aria-pressed={rule.actual === true}
                      >
                        {rule.type === "LOGGING_REQUIREMENT" ? "LOGGED" : "PASS"}
                      </button>
                      <button
                        type="button"
                        className={rule.actual === false ? "is-selected is-fail" : ""}
                        onClick={() => void updateRule(rule.key, false)}
                        disabled={pendingKey !== null}
                        aria-pressed={rule.actual === false}
                      >
                        {rule.type === "LOGGING_REQUIREMENT" ? "NOT LOGGED" : "FAIL"}
                      </button>
                    </div>
                  ) : (
                    <div className="quest-actions quest-actions--numeric">
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          const form = new FormData(event.currentTarget);
                          const value = Number(form.get("value"));
                          if (Number.isFinite(value) && value >= 0)
                            void updateRule(rule.key, value);
                        }}
                      >
                        <label>
                          <span className="sr-only">{rule.name} value</span>
                          <input
                            key={`${rule.key}-${String(rule.actual)}`}
                            name="value"
                            type="number"
                            min="0"
                            step={rule.key === "steps" ? "1" : "0.01"}
                            defaultValue={
                              typeof rule.actual === "number" ? rule.actual : ""
                            }
                            inputMode={rule.key === "steps" ? "numeric" : "decimal"}
                            placeholder="0"
                            disabled={pendingKey !== null}
                          />
                        </label>
                        <button type="submit" disabled={pendingKey !== null}>
                          SAVE
                        </button>
                      </form>
                      {rule.key === "hydration" && (
                        <div className="hydration-actions">
                          <button
                            type="button"
                            onClick={() =>
                              void updateRule(
                                rule.key,
                                Math.max(0, Number(rule.actual ?? 0) + 0.25),
                              )
                            }
                            disabled={pendingKey !== null}
                          >
                            +250 ML
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void updateRule(
                                rule.key,
                                Math.max(0, Number(rule.actual ?? 0) + 0.5),
                              )
                            }
                            disabled={pendingKey !== null}
                          >
                            +500 ML
                          </button>
                          <button
                            type="button"
                            onClick={() => void updateRule(rule.key, 0)}
                            disabled={pendingKey !== null}
                          >
                            RESET
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {rule.completionPercent !== null && !booleanRule && (
                    <div className="rule-progress" aria-hidden="true">
                      <span style={{ width: `${rule.completionPercent}%` }} />
                    </div>
                  )}
                  {isPending && <p className="quest-save-state">SAVING…</p>}
                </article>
              );
            })}
        </div>

        {quest.isPerfectDay && (
          <div className="quest-complete" role="status" aria-live="polite">
            <strong>DAILY QUEST COMPLETE</strong>
            <span>
              {quest.completedRequiredRules} / {quest.totalRequiredRules} OBJECTIVES
              CLEARED
            </span>
            <span>PERFECT DAY BONUS // +{PERFECT_DAY_XP} XP</span>
          </div>
        )}
        {message && (
          <p className="quest-feedback" role="status">
            {message}
          </p>
        )}
      </SystemPanel>
    </div>
  );
}
