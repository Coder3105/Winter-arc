"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { SystemPanel } from "@/components/system/system-panel";
import { DAILY_RULE_CATALOGUE, type DailyRuleKey } from "@/features/winter-arc/rules";
import { redirectExpiredSession } from "@/lib/auth/client-session";
import {
  onboardingActivationInputSchema,
  type OnboardingDraftInput,
} from "@/lib/validation/onboarding";
import { TIMEZONE_OPTIONS } from "@/lib/utils/timezones";

interface SetupFlowProps {
  readonly email: string;
  readonly initialDraft: (OnboardingDraftInput & { readonly updatedAt: string }) | null;
}

interface RuleState {
  readonly key: DailyRuleKey;
  readonly target: string;
}

interface WizardState {
  readonly displayName: string;
  readonly heightCm: string;
  readonly currentWeightKg: string;
  readonly targetWeightKg: string;
  readonly ageAtBaseline: string;
  readonly sex: "" | "male" | "female" | "other" | "prefer_not_to_say";
  readonly timezone: string;
  readonly startDate: string;
  readonly weeklyWorkoutTarget: string;
  readonly rules: readonly RuleState[];
}

const STEPS = [
  "IDENTITY",
  "PROFILE",
  "DAILY PROTOCOL",
  "TRAINING",
  "WINTER ARC",
  "ACTIVATE",
] as const;

function numberText(value: number | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

function initialState(draft: SetupFlowProps["initialDraft"]): WizardState {
  return {
    displayName: draft?.displayName ?? "",
    heightCm: numberText(draft?.heightCm),
    currentWeightKg: numberText(draft?.currentWeightKg),
    targetWeightKg: numberText(draft?.targetWeightKg),
    ageAtBaseline: numberText(draft?.ageAtBaseline),
    sex: draft?.sex ?? "",
    timezone: draft?.timezone ?? "",
    startDate: draft?.startDate ?? "",
    weeklyWorkoutTarget: numberText(draft?.weeklyWorkoutTarget),
    rules:
      draft?.rules.map((rule) => ({ key: rule.key, target: numberText(rule.target) })) ??
      DAILY_RULE_CATALOGUE.filter((rule) => rule.recommended).map((rule) => ({
        key: rule.key,
        target: "",
      })),
  };
}

function nullableNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function browserCalendarDate() {
  const now = new Date();
  const year = String(now.getFullYear()).padStart(4, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function setupFailureMessage(response: Response, fallback: string) {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "object" &&
      body.error !== null &&
      "message" in body.error &&
      typeof body.error.message === "string" &&
      body.error.message.trim()
    ) {
      return body.error.message;
    }
  } catch {
    // Proxies may return HTML or an empty body. Keep the local form in either case.
  }
  return `${fallback} (HTTP ${response.status}). Please retry; your entries are still available.`;
}

export function SetupFlow({ email, initialDraft }: SetupFlowProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [state, setState] = useState(() => initialState(initialDraft));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [detectedTimezone, setDetectedTimezone] = useState<string | null>(null);

  function detectTimezone() {
    try {
      setDetectedTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || null);
    } catch {
      setDetectedTimezone(null);
    }
  }

  const selectedKeys = useMemo(
    () => new Set(state.rules.map((rule) => rule.key)),
    [state.rules],
  );

  function patch(values: Partial<WizardState>) {
    setState((current) => ({ ...current, ...values }));
  }

  function toggleRule(key: DailyRuleKey, selected: boolean) {
    patch({
      rules: selected
        ? [...state.rules, { key, target: "" }]
        : state.rules.filter((rule) => rule.key !== key),
    });
  }

  function setRuleTarget(key: DailyRuleKey, target: string) {
    patch({
      rules: state.rules.map((rule) => (rule.key === key ? { ...rule, target } : rule)),
    });
  }

  function payload(): OnboardingDraftInput {
    return {
      displayName: state.displayName,
      heightCm: nullableNumber(state.heightCm),
      currentWeightKg: nullableNumber(state.currentWeightKg),
      targetWeightKg: nullableNumber(state.targetWeightKg),
      ageAtBaseline: nullableNumber(state.ageAtBaseline),
      sex: state.sex || null,
      timezone: state.timezone.trim() || null,
      startDate: state.startDate || null,
      weeklyWorkoutTarget: nullableNumber(state.weeklyWorkoutTarget),
      rules: state.rules.map((rule) => ({
        key: rule.key,
        target: nullableNumber(rule.target),
      })),
    };
  }

  function validateStep(index: number): string | null {
    if (index === 0 && state.displayName.trim().length < 2) {
      return "Enter a display name containing 2 to 40 characters.";
    }
    if (index === 2) {
      if (state.rules.length === 0) return "Select at least one Daily Quest rule.";
      for (const selection of state.rules) {
        const definition = DAILY_RULE_CATALOGUE.find(
          (rule) => rule.key === selection.key,
        );
        if (definition?.target && !selection.target.trim()) {
          return `Confirm the ${definition.name} target.`;
        }
      }
    }
    if (index === 3 && !state.weeklyWorkoutTarget) {
      return "Confirm a weekly workout target from 1 to 7 days.";
    }
    if (index === 4) {
      if (!state.timezone.trim()) return "Explicitly select a timezone.";
      if (!state.startDate) return "Explicitly select a Winter Arc start date.";
    }
    return null;
  }

  function navigate(next: number) {
    if (pending) return;
    if (next > step) {
      const issue = validateStep(step);
      if (issue) {
        setMessage(issue);
        return;
      }
    }
    setMessage(null);
    setStep(next);
  }

  async function saveDraft() {
    if (pending) return;
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/v1/onboarding", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload()),
      });
      if (redirectExpiredSession(response)) return;
      if (!response.ok)
        throw new Error(
          await setupFailureMessage(response, "The setup draft could not be saved"),
        );
      setMessage("DRAFT SAVED // PROTOCOL REMAINS INACTIVE");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Draft save failed.");
    } finally {
      setPending(false);
    }
  }

  async function activate() {
    if (pending) return;
    const parsed = onboardingActivationInputSchema.safeParse(payload());
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setMessage(parsed.error.issues.map((entry) => entry.message).join(" "));
      const fieldStep: Record<string, number> = {
        displayName: 0,
        heightCm: 1,
        currentWeightKg: 1,
        targetWeightKg: 1,
        ageAtBaseline: 1,
        sex: 1,
        rules: 2,
        weeklyWorkoutTarget: 3,
        timezone: 4,
        startDate: 4,
      };
      setStep(fieldStep[String(issue?.path[0])] ?? 5);
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/v1/onboarding/activate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (redirectExpiredSession(response)) return;
      if (!response.ok)
        throw new Error(
          await setupFailureMessage(response, "Winter Arc activation failed"),
        );
      router.replace("/today");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Activation failed.");
      setPending(false);
    }
  }

  return (
    <div className="setup-flow">
      <ol className="setup-progress" aria-label="Initialization progress">
        {STEPS.map((name, index) => (
          <li
            key={name}
            className={index === step ? "is-active" : index < step ? "is-complete" : ""}
          >
            <button
              type="button"
              onClick={() => navigate(index)}
              disabled={pending}
              aria-current={index === step ? "step" : undefined}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <small>{name}</small>
            </button>
          </li>
        ))}
      </ol>

      <SystemPanel
        eyebrow={`INITIALIZATION // ${String(step + 1).padStart(2, "0")} OF 06`}
        title={STEPS[step] ?? "SYSTEM INITIALIZATION"}
        glow
      >
        <div className="setup-step">
          {message && (
            <p className="form-message" role="alert">
              {message}
            </p>
          )}

          {step === 0 && (
            <div className="form-grid">
              <label className="system-field system-field--wide">
                <span>DISPLAY NAME // REQUIRED</span>
                <input
                  value={state.displayName}
                  minLength={2}
                  maxLength={40}
                  autoComplete="nickname"
                  onChange={(event) => patch({ displayName: event.target.value })}
                  placeholder="Enter your System identity"
                />
                <small>
                  2–40 characters. Your email is never used as a name automatically.
                </small>
              </label>
              <label className="system-field system-field--wide">
                <span>VERIFIED EMAIL // READ ONLY</span>
                <input value={email} readOnly aria-readonly="true" />
              </label>
            </div>
          )}

          {step === 1 && (
            <div className="form-grid">
              <p className="setup-intro system-field--wide">
                Physical data is optional. Empty fields remain unavailable—not zero—and no
                body-composition assessment is created.
              </p>
              <label className="system-field">
                <span>HEIGHT // CM // OPTIONAL</span>
                <input
                  type="number"
                  min="1"
                  max="300"
                  step="0.1"
                  value={state.heightCm}
                  onChange={(event) => patch({ heightCm: event.target.value })}
                  placeholder="Not set"
                />
              </label>
              <label className="system-field">
                <span>CURRENT WEIGHT // KG // OPTIONAL</span>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  step="0.1"
                  value={state.currentWeightKg}
                  onChange={(event) => patch({ currentWeightKg: event.target.value })}
                  placeholder="Not set"
                />
              </label>
              <label className="system-field">
                <span>GOAL WEIGHT // KG // OPTIONAL</span>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  step="0.1"
                  value={state.targetWeightKg}
                  onChange={(event) => patch({ targetWeightKg: event.target.value })}
                  placeholder="Not set"
                />
              </label>
              <label className="system-field">
                <span>AGE // OPTIONAL</span>
                <input
                  type="number"
                  min="0"
                  max="150"
                  step="1"
                  value={state.ageAtBaseline}
                  onChange={(event) => patch({ ageAtBaseline: event.target.value })}
                  placeholder="Not set"
                />
              </label>
              <label className="system-field system-field--wide">
                <span>SEX // OPTIONAL</span>
                <select
                  value={state.sex}
                  onChange={(event) =>
                    patch({ sex: event.target.value as WizardState["sex"] })
                  }
                >
                  <option value="">Not set</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="rule-list">
              <p className="setup-intro">
                Select the objectives you want to track. Suggested targets are
                placeholders only; numeric targets must be explicitly entered.
              </p>
              {DAILY_RULE_CATALOGUE.map((definition) => {
                const selected = selectedKeys.has(definition.key);
                const selection = state.rules.find(
                  (candidate) => candidate.key === definition.key,
                );
                return (
                  <article className="rule-row" key={definition.key}>
                    <label className="system-toggle">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(event) =>
                          toggleRule(definition.key, event.target.checked)
                        }
                      />
                      <span aria-hidden="true" />
                      <strong>
                        {definition.name}
                        {definition.private ? " // PRIVATE" : ""}
                      </strong>
                    </label>
                    <div className="rule-row__description">
                      <p>{definition.description}</p>
                      {selected && definition.target && (
                        <label>
                          <span>{definition.name} TARGET</span>
                          <input
                            type="number"
                            min={definition.target.min}
                            max={definition.target.max}
                            step={definition.target.step}
                            value={selection?.target ?? ""}
                            onChange={(event) =>
                              setRuleTarget(definition.key, event.target.value)
                            }
                            placeholder={String(definition.target.placeholder)}
                            inputMode={
                              definition.target.step === 1 ? "numeric" : "decimal"
                            }
                          />
                          <small>{definition.unit}</small>
                        </label>
                      )}
                    </div>
                  </article>
                );
              })}
              <p className="source-note">
                NO FAP IS OPTIONAL, PRIVATE, AND NEVER PRESELECTED.
              </p>
            </div>
          )}

          {step === 3 && (
            <div className="form-grid">
              <p className="setup-intro system-field--wide">
                Choose the number of distinct completed training days required each
                challenge week. Enter 4 to explicitly accept the suggested 4 / 7 target.
              </p>
              <label className="system-field system-field--wide">
                <span>WEEKLY WORKOUT TARGET // REQUIRED</span>
                <input
                  type="number"
                  min="1"
                  max="7"
                  step="1"
                  value={state.weeklyWorkoutTarget}
                  onChange={(event) => patch({ weeklyWorkoutTarget: event.target.value })}
                  placeholder="Suggested: 4"
                />
                <small>Allowed range: 1–7 distinct training days per week.</small>
              </label>
            </div>
          )}

          {step === 4 && (
            <div className="form-grid">
              <label className="system-field system-field--wide">
                <span>TIMEZONE // REQUIRED</span>
                <input
                  list="setup-timezones"
                  value={state.timezone}
                  onChange={(event) => patch({ timezone: event.target.value })}
                  placeholder="Search or enter an IANA timezone"
                  autoComplete="off"
                />
                <datalist id="setup-timezones">
                  {TIMEZONE_OPTIONS.map((timezone) => (
                    <option key={timezone} value={timezone} />
                  ))}
                </datalist>
                <small>
                  Your calendar day, reset, and challenge dates use this zone.
                </small>
              </label>
              {!detectedTimezone && (
                <button
                  type="button"
                  className="secondary-button system-field--wide"
                  onClick={detectTimezone}
                >
                  DETECT BROWSER TIMEZONE
                </button>
              )}
              {detectedTimezone && (
                <div className="timezone-suggestion system-field--wide">
                  <span>DETECTED // {detectedTimezone}</span>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => patch({ timezone: detectedTimezone })}
                  >
                    USE THIS TIMEZONE
                  </button>
                </div>
              )}
              <label className="system-field system-field--wide">
                <span>WINTER ARC START DATE // REQUIRED</span>
                <input
                  type="date"
                  value={state.startDate}
                  onChange={(event) => patch({ startDate: event.target.value })}
                />
                <small>Future dates are supported. Duration is fixed at 90 days.</small>
              </label>
              <button
                type="button"
                className="secondary-button system-field--wide"
                onClick={() => patch({ startDate: browserCalendarDate() })}
              >
                START TODAY
              </button>
            </div>
          )}

          {step === 5 && (
            <div className="ready-summary">
              <p className="ready-summary__signal">SYSTEM INITIALIZATION READY</p>
              <dl>
                <div>
                  <dt>PROFILE</dt>
                  <dd>{state.displayName.trim() || "NOT SET"}</dd>
                </div>
                <div>
                  <dt>PHYSICAL DATA</dt>
                  <dd>
                    {[state.heightCm, state.currentWeightKg, state.targetWeightKg].filter(
                      Boolean,
                    ).length || "OPTIONAL // NOT SET"}
                  </dd>
                </div>
                <div>
                  <dt>DAILY PROTOCOL</dt>
                  <dd>{state.rules.length} OBJECTIVES</dd>
                </div>
                <div>
                  <dt>TRAINING PROTOCOL</dt>
                  <dd>{state.weeklyWorkoutTarget || "NOT SET"} / 7 DAYS</dd>
                </div>
                <div>
                  <dt>TIMEZONE</dt>
                  <dd>{state.timezone || "NOT SET"}</dd>
                </div>
                <div>
                  <dt>START DATE</dt>
                  <dd>{state.startDate || "NOT SET"}</dd>
                </div>
                <div>
                  <dt>DURATION</dt>
                  <dd>90 DAYS</dd>
                </div>
                <div>
                  <dt>BODY COMPOSITION</dt>
                  <dd>NO ASSESSMENT CREATED</dd>
                </div>
              </dl>
              <button
                className="system-button setup-activate"
                type="button"
                onClick={() => void activate()}
                disabled={pending}
              >
                {pending ? "INITIALIZING…" : "ACTIVATE WINTER ARC"}
              </button>
            </div>
          )}
        </div>
      </SystemPanel>

      <div className="setup-draft-actions">
        <button
          className="secondary-button"
          type="button"
          onClick={() => void saveDraft()}
          disabled={pending}
        >
          {pending ? "SAVING…" : "SAVE DRAFT"}
        </button>
        <span>Draft saves never activate the protocol.</span>
      </div>

      <div className="setup-navigation">
        <button
          className="secondary-button"
          type="button"
          onClick={() => navigate(Math.max(0, step - 1))}
          disabled={pending || step === 0}
        >
          ← BACK
        </button>
        {step < STEPS.length - 1 && (
          <button
            className="system-button"
            type="button"
            onClick={() => navigate(Math.min(STEPS.length - 1, step + 1))}
            disabled={pending}
          >
            NEXT →
          </button>
        )}
      </div>
    </div>
  );
}
