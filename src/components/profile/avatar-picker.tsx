"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AVATAR_CATALOGUE,
  getAvatar,
  normalizeAvatarKey,
  type AvatarKey,
} from "@/lib/avatar-catalogue";
import { avatarSelectionSchema } from "@/lib/validation/avatar";
import { redirectExpiredSession } from "@/lib/auth/client-session";
import { Avatar } from "./avatar";

export function AvatarPicker({
  initialAvatarKey,
}: {
  readonly initialAvatarKey: AvatarKey | null;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialAvatarKey);
  const [selection, setSelection] = useState(initialAvatarKey);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/v1/profile/avatar", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ avatarKey: selection }),
      });
      if (redirectExpiredSession(response)) return;
      const payload = await response.json();
      const result = avatarSelectionSchema.safeParse(payload.data);
      if (!response.ok || !payload.success || !result.success) {
        throw new Error(
          payload.error?.message ?? "Avatar could not be saved. Try again.",
        );
      }
      setSaved(result.data.avatarKey);
      setSelection(result.data.avatarKey);
      setMessage("SYSTEM IDENTITY UPDATED");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Avatar could not be saved. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <form
      className="avatar-picker"
      aria-busy={saving}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <p className="avatar-picker__saved">CURRENT AVATAR: {getAvatar(saved).name}</p>
      <fieldset disabled={saving}>
        <legend>Choose your System identity</legend>
        <div className="avatar-grid">
          {AVATAR_CATALOGUE.map((avatar) => {
            const value = normalizeAvatarKey(avatar.key);
            const selected = value === selection;
            return (
              <button
                className="avatar-option"
                key={avatar.key}
                type="button"
                aria-pressed={selected}
                aria-label={avatar.name}
                onClick={() => {
                  setSelection(value);
                  setMessage(null);
                  setError(null);
                }}
              >
                <Avatar avatarKey={value} size={128} />
                <strong>{avatar.name}</strong>
                <small>{avatar.description}</small>
                <span className="avatar-option__state">
                  {selected ? "\u2713 SELECTED" : "SELECT"}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="avatar-picker__actions">
        <button
          type="button"
          className="secondary-button"
          disabled={saving}
          onClick={() => {
            setSelection(null);
            setMessage("Default selected. Save to apply.");
            setError(null);
          }}
        >
          RESET TO DEFAULT
        </button>
        <button
          type="submit"
          className="system-button"
          disabled={saving || saved === selection}
        >
          {saving ? "SAVING AVATAR..." : "SAVE AVATAR"}
        </button>
      </div>
      <p className="avatar-picker__note">
        Your choice is cosmetic. All portraits are available to everyone.
      </p>
      {message ? <p role="status">{message}</p> : null}
      {error ? (
        <p role="alert" className="guild-feedback--error">
          {error}
        </p>
      ) : null}
    </form>
  );
}
