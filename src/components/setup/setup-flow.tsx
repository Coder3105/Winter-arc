"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { redirectExpiredSession } from "@/lib/auth/client-session";
import { profileInputSchema } from "@/lib/validation/profile";
import { getSetupIssue, setupSaveError } from "@/lib/validation/setup";
import { TIMEZONE_OPTIONS } from "@/lib/utils/timezones";

import {
  createDefaultDailyRules,
  type DailyRuleConfiguration,
} from "@/features/winter-arc/rules";
import { BaselineSummary } from "@/components/profile/baseline-summary";
import { SystemPanel } from "@/components/system/system-panel";

interface ProfileState {
  displayName: string;
  dateOfBirth: null;
  ageAtBaseline: number;
  sex: "male" | "female" | "other" | "prefer_not_to_say";
  heightCm: number;
  preferredWeightUnit: "kg" | "lb";
  preferredDistanceUnit: "km" | "mi";
  timezone: string;
}

interface ConfigState {
  name: string;
  durationDays: number;
  startDate: string;
  startingWeightKg: number;
  targetWeightKg: string;
  weeklyWorkoutTarget: number;
  rules: DailyRuleConfiguration[];
}

interface SetupFlowProps {
  readonly initialProfile: Omit<ProfileState, "dateOfBirth"> | null;
  readonly initialConfig:
    | (Omit<ConfigState, "targetWeightKg"> & {
        targetWeightKg: number | null;
      })
    | null;
  readonly baseline: Parameters<typeof BaselineSummary>[0]["baseline"];
}

const STEPS = [
  "IDENTITY",
  "90 DAY PROTOCOL",
  "DAILY QUEST RULES",
  "INITIAL STATUS",
  "SYSTEM READY",
];

export function SetupFlow({ initialProfile, initialConfig, baseline }: SetupFlowProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileState>({
    displayName: initialProfile?.displayName ?? "Nivedan",
    dateOfBirth: null,
    ageAtBaseline: initialProfile?.ageAtBaseline ?? 24,
    sex: initialProfile?.sex ?? "male",
    heightCm: initialProfile?.heightCm ?? 178,
    preferredWeightUnit: initialProfile?.preferredWeightUnit ?? "kg",
    preferredDistanceUnit: initialProfile?.preferredDistanceUnit ?? "km",
    timezone: initialProfile?.timezone ?? "",
  });
  const [config, setConfig] = useState<ConfigState>({
    name: initialConfig?.name ?? "Winter Arc",
    durationDays: initialConfig?.durationDays ?? 90,
    startDate: initialConfig?.startDate ?? "",
    startingWeightKg:
      initialConfig?.startingWeightKg ?? baseline?.measurements.weightKg ?? 111.1,
    targetWeightKg: initialConfig?.targetWeightKg?.toString() ?? "",
    weeklyWorkoutTarget: initialConfig?.weeklyWorkoutTarget ?? 4,
    rules: initialConfig?.rules ?? createDefaultDailyRules(),
  });

  function setRule(index: number, patch: Partial<DailyRuleConfiguration>) {
    setConfig((current) => ({
      ...current,
      rules: current.rules.map((rule, ruleIndex) =>
        ruleIndex === index ? { ...rule, ...patch } : rule,
      ),
    }));
  }

  function configInput(status: "DRAFT" | "ACTIVE" = "ACTIVE") {
    return {
      ...config,
      targetWeightKg: config.targetWeightKg.trim() ? Number(config.targetWeightKg) : null,
      status,
      notificationPreferences: { enabled: false },
    };
  }

  function validate(throughStep = 2) {
    const issue = getSetupIssue(profile, configInput(), throughStep);
    if (issue) {
      setMessage(issue.message);
      setStep(issue.step);
      return false;
    }
    setMessage(null);
    return true;
  }

  function navigate(next: number) {
    if (pending) return;
    if (next > step && !validate(Math.min(next - 1, 2))) return;
    setMessage(null);
    setStep(next);
  }

  async function save(status: "DRAFT" | "ACTIVE") {
    if (pending || !validate()) {
      return;
    }

    setPending(true);
    setMessage(null);
    try {
      const profileResponse = await fetch("/api/v1/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(profileInputSchema.parse(profile)),
      });
      if (redirectExpiredSession(profileResponse)) return;
      if (!profileResponse.ok) {
        throw new Error(await setupSaveError(profileResponse, "Profile"));
      }

      const configResponse = await fetch("/api/v1/winter-arc", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(configInput(status)),
      });
      if (redirectExpiredSession(configResponse)) return;
      if (!configResponse.ok) {
        throw new Error(await setupSaveError(configResponse, "Protocol"));
      }

      if (status === "ACTIVE") {
        router.push("/");
        router.refresh();
      } else {
        setMessage("Draft configuration saved.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "System configuration failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="setup-flow">
      <ol className="setup-progress" aria-label="Setup progress">
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
        eyebrow={`STEP ${String(step + 1).padStart(2, "0")} / 05`}
        title={STEPS[step] ?? "SYSTEM CONFIGURATION"}
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
                <span>DISPLAY NAME</span>
                <input
                  value={profile.displayName}
                  onChange={(event) =>
                    setProfile({ ...profile, displayName: event.target.value })
                  }
                />
              </label>
              <label className="system-field">
                <span>HEIGHT // CM</span>
                <input
                  type="number"
                  min="1"
                  step="0.1"
                  value={profile.heightCm}
                  onChange={(event) =>
                    setProfile({ ...profile, heightCm: Number(event.target.value) })
                  }
                />
              </label>
              <label className="system-field">
                <span>AGE AT BASELINE</span>
                <input
                  type="number"
                  min="0"
                  max="150"
                  value={profile.ageAtBaseline}
                  onChange={(event) =>
                    setProfile({ ...profile, ageAtBaseline: Number(event.target.value) })
                  }
                />
              </label>
              <label className="system-field">
                <span>SEX</span>
                <select
                  value={profile.sex}
                  onChange={(event) =>
                    setProfile({
                      ...profile,
                      sex: event.target.value as ProfileState["sex"],
                    })
                  }
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              </label>
              <label className="system-field">
                <span>TIMEZONE</span>
                <select
                  value={profile.timezone}
                  onChange={(event) =>
                    setProfile({ ...profile, timezone: event.target.value })
                  }
                  required
                  aria-describedby="setup-timezone-help"
                >
                  <option value="" disabled>
                    Select your timezone
                  </option>
                  {profile.timezone &&
                    !TIMEZONE_OPTIONS.some((zone) => zone === profile.timezone) && (
                      <option value={profile.timezone}>{profile.timezone}</option>
                    )}
                  {TIMEZONE_OPTIONS.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </select>
                <small id="setup-timezone-help">
                  Required. Determines your daily reset and challenge dates.
                </small>
              </label>
            </div>
          )}

          {step === 1 && (
            <div className="form-grid">
              <label className="system-field system-field--wide">
                <span>CHALLENGE NAME</span>
                <input
                  value={config.name}
                  onChange={(event) => setConfig({ ...config, name: event.target.value })}
                />
              </label>
              <label className="system-field">
                <span>START DATE</span>
                <input
                  type="date"
                  value={config.startDate}
                  onChange={(event) =>
                    setConfig({ ...config, startDate: event.target.value })
                  }
                />
              </label>
              <label className="system-field">
                <span>DURATION // DAYS</span>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={config.durationDays}
                  onChange={(event) =>
                    setConfig({ ...config, durationDays: Number(event.target.value) })
                  }
                />
              </label>
              <label className="system-field">
                <span>STARTING WEIGHT // KG</span>
                <input
                  type="number"
                  min="1"
                  step="0.1"
                  value={config.startingWeightKg}
                  onChange={(event) =>
                    setConfig({ ...config, startingWeightKg: Number(event.target.value) })
                  }
                />
              </label>
              <label className="system-field">
                <span>OPTIONAL GOAL WEIGHT // KG</span>
                <input
                  type="number"
                  min="1"
                  step="0.1"
                  value={config.targetWeightKg}
                  onChange={(event) =>
                    setConfig({ ...config, targetWeightKg: event.target.value })
                  }
                  placeholder="Not set"
                />
              </label>
              <label className="system-field system-field--wide">
                <span>WEEKLY WORKOUT REQUIREMENT</span>
                <input
                  type="number"
                  min="1"
                  max="7"
                  value={config.weeklyWorkoutTarget}
                  onChange={(event) =>
                    setConfig({
                      ...config,
                      weeklyWorkoutTarget: Number(event.target.value),
                    })
                  }
                />
                <small>Separate from the seven daily rules.</small>
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="rule-list">
              {config.rules.map((rule, index) => (
                <article className="rule-row" key={rule.key}>
                  <label className="system-toggle">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(event) =>
                        setRule(index, { enabled: event.target.checked })
                      }
                    />
                    <span aria-hidden="true" />
                    <strong>{rule.name}</strong>
                  </label>
                  <div className="rule-row__meta">
                    <span>{rule.requiredFrequency} DAYS / WEEK</span>
                    {rule.type === "NUMERIC_MINIMUM" && (
                      <label>
                        <span className="sr-only">{rule.name} target</span>
                        <input
                          type="number"
                          min="0"
                          step={rule.key === "hydration" ? "0.1" : "1"}
                          value={rule.target ?? ""}
                          onChange={(event) =>
                            setRule(index, { target: Number(event.target.value) })
                          }
                        />
                        <small>{rule.unit}</small>
                      </label>
                    )}
                  </div>
                </article>
              ))}
              <p className="source-note">
                WORKOUTS: 4 / 7 WEEKLY — CONFIGURED SEPARATELY
              </p>
            </div>
          )}

          {step === 3 && <BaselineSummary baseline={baseline} />}

          {step === 4 && (
            <div className="ready-summary">
              <p className="ready-summary__signal">SYSTEM CONFIGURATION READY</p>
              <dl>
                <div>
                  <dt>OWNER</dt>
                  <dd>{profile.displayName}</dd>
                </div>
                <div>
                  <dt>TIMEZONE</dt>
                  <dd>{profile.timezone || "NOT SELECTED"}</dd>
                </div>
                <div>
                  <dt>PROTOCOL</dt>
                  <dd>{config.name}</dd>
                </div>
                <div>
                  <dt>DURATION</dt>
                  <dd>{config.durationDays} DAYS</dd>
                </div>
                <div>
                  <dt>WORKOUTS</dt>
                  <dd>{config.weeklyWorkoutTarget} / 7</dd>
                </div>
                <div>
                  <dt>DAILY RULES</dt>
                  <dd>{config.rules.filter((rule) => rule.enabled).length} ENABLED</dd>
                </div>
                <div>
                  <dt>BASELINE</dt>
                  <dd>{baseline ? "INBODY120 LOADED" : "NOT AVAILABLE"}</dd>
                </div>
              </dl>
              <div className="ready-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void save("DRAFT")}
                  disabled={pending}
                >
                  SAVE DRAFT
                </button>
                <button
                  className="system-button"
                  type="button"
                  onClick={() => void save("ACTIVE")}
                  disabled={pending}
                >
                  {pending ? "SAVING" : "ACTIVATE"}
                </button>
              </div>
            </div>
          )}
        </div>
      </SystemPanel>

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
