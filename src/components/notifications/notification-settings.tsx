"use client";

import { useState } from "react";

import { redirectExpiredSession } from "@/lib/auth/client-session";

import type { NotificationPreferencesInput } from "@/lib/validation/notification-preferences";
import type { NotificationPreferencesResult } from "@/server/services/notification-service";

type Available = Extract<NotificationPreferencesResult, { kind: "AVAILABLE" }>;
type PreferenceSection = Exclude<
  keyof NotificationPreferencesInput,
  "enabled" | "dailyQuestEmailReminder" | "privacyMode"
>;

function Toggle({
  checked,
  onChange,
  label,
}: {
  readonly checked: boolean;
  readonly onChange: (value: boolean) => void;
  readonly label: string;
}) {
  return (
    <label className="notification-toggle">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

export function NotificationSettings({ initial }: { readonly initial: Available }) {
  const { timezone } = initial.preferences;
  const preference = initial.preferences;
  const [value, setValue] = useState<NotificationPreferencesInput>(() => ({
    enabled: preference.enabled,
    dailyQuestEmailReminder: preference.dailyQuestEmailReminder,
    privacyMode: preference.privacyMode,
    quietHours: { ...preference.quietHours },
    dailyQuest: { ...preference.dailyQuest },
    morningWeight: { ...preference.morningWeight },
    hydration: {
      ...preference.hydration,
      times: [...preference.hydration.times],
    },
    steps: { ...preference.steps },
    workout: { ...preference.workout },
    recovery: { ...preference.recovery },
    weeklyReport: { ...preference.weeklyReport },
    achievementReward: { ...preference.achievementReward },
  }));
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function category<K extends PreferenceSection>(
    key: K,
    patch: Partial<NotificationPreferencesInput[K]>,
  ) {
    setValue((current) => ({
      ...current,
      [key]: { ...current[key], ...patch },
    }));
  }

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const response = await fetch("/api/v1/notification-preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(value),
      });
      if (redirectExpiredSession(response)) return;
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error();
      setStatus("NOTIFICATION PROTOCOL SAVED.");
    } catch {
      setStatus("NOTIFICATION PROTOCOL COULD NOT BE SAVED.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="notification-settings">
      <div className="notification-settings__lead">
        <Toggle
          label="ENABLE APPLICATION REMINDERS"
          checked={value.enabled}
          onChange={(enabled) => setValue((current) => ({ ...current, enabled }))}
        />
        <p>
          Reminder timing is opt-in. In-app records remain available whether or not a
          device is subscribed for Web Push.
        </p>
        <span>TIMEZONE // {timezone}</span>
      </div>

      <div className="notification-settings__grid">
        <fieldset>
          <legend>DAILY QUEST</legend>
          <Toggle
            label="ENABLED"
            checked={value.dailyQuest.enabled}
            onChange={(enabled) => category("dailyQuest", { enabled })}
          />
          <input
            aria-label="Daily Quest reminder time"
            type="time"
            value={value.dailyQuest.time}
            onChange={(event) => category("dailyQuest", { time: event.target.value })}
          />
        </fieldset>
        <fieldset>
          <legend>MORNING WEIGHT</legend>
          <Toggle
            label="ENABLED"
            checked={value.morningWeight.enabled}
            onChange={(enabled) => category("morningWeight", { enabled })}
          />
          <input
            aria-label="Morning Weight reminder time"
            type="time"
            value={value.morningWeight.time}
            onChange={(event) => category("morningWeight", { time: event.target.value })}
          />
        </fieldset>
        <fieldset>
          <legend>HYDRATION</legend>
          <Toggle
            label="ENABLED"
            checked={value.hydration.enabled}
            onChange={(enabled) => category("hydration", { enabled })}
          />
          <div className="notification-time-list">
            {value.hydration.times.map((time, index) => (
              <div key={`${index}:${time}`}>
                <input
                  aria-label={`Hydration reminder ${index + 1}`}
                  type="time"
                  value={time}
                  onChange={(event) => {
                    const times = [...value.hydration.times];
                    times[index] = event.target.value;
                    category("hydration", { times });
                  }}
                />
                <button
                  type="button"
                  onClick={() =>
                    category("hydration", {
                      times: value.hydration.times.filter((_, item) => item !== index),
                    })
                  }
                >
                  REMOVE
                </button>
              </div>
            ))}
            {value.hydration.times.length < 4 && (
              <button
                type="button"
                onClick={() =>
                  category("hydration", {
                    times: [...value.hydration.times, "12:00"],
                  })
                }
              >
                ADD TIME
              </button>
            )}
          </div>
        </fieldset>
        <fieldset>
          <legend>STEPS</legend>
          <Toggle
            label="ENABLED"
            checked={value.steps.enabled}
            onChange={(enabled) => category("steps", { enabled })}
          />
          <input
            aria-label="Steps reminder time"
            type="time"
            value={value.steps.time}
            onChange={(event) => category("steps", { time: event.target.value })}
          />
        </fieldset>
        {(["workout", "recovery", "achievementReward"] as const).map((key) => (
          <fieldset key={key}>
            <legend>{key.replace(/([A-Z])/g, " $1").toUpperCase()}</legend>
            <Toggle
              label="ENABLED"
              checked={value[key].enabled}
              onChange={(enabled) => category(key, { enabled })}
            />
          </fieldset>
        ))}
        <fieldset>
          <legend>WEEKLY REPORT</legend>
          <Toggle
            label="ENABLED"
            checked={value.weeklyReport.enabled}
            onChange={(enabled) => category("weeklyReport", { enabled })}
          />
          <input
            aria-label="Weekly Report reminder time"
            type="time"
            value={value.weeklyReport.time}
            onChange={(event) => category("weeklyReport", { time: event.target.value })}
          />
        </fieldset>
      </div>

      <fieldset className="notification-settings__wide notification-settings__email">
        <legend>EMAIL REMINDERS</legend>
        <Toggle
          label="DAILY QUEST REMINDER AT 6 PM"
          checked={value.dailyQuestEmailReminder}
          onChange={(dailyQuestEmailReminder) =>
            setValue((current) => ({ ...current, dailyQuestEmailReminder }))
          }
        />
        <p>
          Receive an email at 6 PM in your configured timezone when today&apos;s Daily
          Quest is still incomplete. Email reminders are separate from application and Web
          Push reminders.
        </p>
      </fieldset>

      <fieldset className="notification-settings__wide">
        <legend>QUIET HOURS</legend>
        <Toggle
          label="ENABLED"
          checked={value.quietHours.enabled}
          onChange={(enabled) => category("quietHours", { enabled })}
        />
        <div className="quiet-hours-fields">
          <label>
            START
            <input
              type="time"
              value={value.quietHours.startLocalTime}
              onChange={(event) =>
                category("quietHours", { startLocalTime: event.target.value })
              }
            />
          </label>
          <label>
            END
            <input
              type="time"
              value={value.quietHours.endLocalTime}
              onChange={(event) =>
                category("quietHours", { endLocalTime: event.target.value })
              }
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="notification-settings__wide">
        <legend>PRIVACY MODE</legend>
        <select
          value={value.privacyMode}
          onChange={(event) =>
            setValue((current) => ({
              ...current,
              privacyMode: event.target.value as "PRIVATE" | "DETAILED",
            }))
          }
        >
          <option value="PRIVATE">PRIVATE PREVIEW</option>
          <option value="DETAILED">DETAILED NON-SENSITIVE PREVIEW</option>
        </select>
        <p>Sensitive habit names, weight values, and private notes remain hidden.</p>
      </fieldset>

      <button
        className="primary-button"
        type="button"
        disabled={saving}
        onClick={() => void save()}
      >
        {saving ? "SAVING…" : "SAVE NOTIFICATION PROTOCOL"}
      </button>
      {status && <p className="notification-settings__status">{status}</p>}
    </div>
  );
}
