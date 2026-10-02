"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

type LoginMode = "PASSWORD" | "EMAIL_CODE";
type CodePhase = "REQUEST" | "VERIFY";

interface OtpRequestData {
  readonly requestId: string;
  readonly resendAvailableInSeconds: number;
}

async function readFailure(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as {
      readonly error?: { readonly message?: string };
    };
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

export function LoginForm({ redirectTo = "/" }: { readonly redirectTo?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<LoginMode>("PASSWORD");
  const [codePhase, setCodePhase] = useState<CodePhase>("REQUEST");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(
      () => setCooldown((current) => Math.max(0, current - 1)),
      1_000,
    );
    return () => window.clearInterval(timer);
  }, [cooldown]);

  function selectMode(next: LoginMode) {
    if (pending) return;
    setMode(next);
    setCodePhase("REQUEST");
    setRequestId(null);
    setOtp("");
    setError(null);
    setNotice(null);
  }

  async function enterSystem() {
    router.replace(redirectTo);
    router.refresh();
  }

  async function handlePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      if (!response.ok) {
        setError("Invalid email or password.");
        return;
      }
      await enterSystem();
    } catch {
      setError("System access is temporarily unavailable.");
    } finally {
      setPending(false);
    }
  }

  async function requestCode(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (pending || cooldown > 0) return;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/v1/auth/login/otp/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        setError(await readFailure(response, "The access code could not be requested."));
        return;
      }
      const body = (await response.json()) as { readonly data: OtpRequestData };
      setRequestId(body.data.requestId);
      setCooldown(body.data.resendAvailableInSeconds);
      setCodePhase("VERIFY");
      setNotice("If this account is eligible, a six-digit code has been sent.");
    } catch {
      setError("Email code access is temporarily unavailable.");
    } finally {
      setPending(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requestId) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/auth/login/otp/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, requestId, otp }),
      });
      if (!response.ok) {
        setError(
          await readFailure(response, "The authentication code is invalid or expired."),
        );
        return;
      }
      await enterSystem();
    } catch {
      setError("System access is temporarily unavailable.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="auth-control">
      <div className="auth-mode-switch" role="group" aria-label="Login method">
        <button
          type="button"
          className={mode === "PASSWORD" ? "is-active" : ""}
          onClick={() => selectMode("PASSWORD")}
          aria-pressed={mode === "PASSWORD"}
        >
          PASSWORD
        </button>
        <button
          type="button"
          className={mode === "EMAIL_CODE" ? "is-active" : ""}
          onClick={() => selectMode("EMAIL_CODE")}
          aria-pressed={mode === "EMAIL_CODE"}
        >
          EMAIL CODE
        </button>
      </div>

      {mode === "PASSWORD" ? (
        <form className="system-form" onSubmit={handlePassword}>
          <label className="system-field">
            <span>EMAIL</span>
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label className="system-field">
            <span>PASSWORD</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          {error && (
            <p className="form-message form-message--error" role="alert">
              {error}
            </p>
          )}
          <button className="system-button" type="submit" disabled={pending}>
            <span>{pending ? "VERIFYING" : "ENTER SYSTEM"}</span>
            <span className="system-button__arrow" aria-hidden="true">
              →
            </span>
          </button>
        </form>
      ) : codePhase === "REQUEST" ? (
        <form className="system-form" onSubmit={(event) => void requestCode(event)}>
          <label className="system-field">
            <span>EMAIL</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          {error && (
            <p className="form-message form-message--error" role="alert">
              {error}
            </p>
          )}
          <button className="system-button" type="submit" disabled={pending}>
            {pending ? "SENDING" : "REQUEST ACCESS CODE"}
          </button>
        </form>
      ) : (
        <form className="system-form" onSubmit={verifyCode}>
          <p className="auth-address">CODE DESTINATION // {email}</p>
          <label className="system-field">
            <span>6-DIGIT ACCESS CODE</span>
            <input
              className="auth-code-input"
              value={otp}
              onChange={(event) =>
                setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoFocus
            />
          </label>
          {notice && (
            <p className="form-message" role="status">
              {notice}
            </p>
          )}
          {error && (
            <p className="form-message form-message--error" role="alert">
              {error}
            </p>
          )}
          <button
            className="system-button"
            type="submit"
            disabled={pending || otp.length !== 6}
          >
            {pending ? "VERIFYING" : "VERIFY AND ENTER"}
          </button>
          <div className="auth-secondary-actions">
            <button
              className="text-button"
              type="button"
              disabled={pending || cooldown > 0}
              onClick={() => void requestCode()}
            >
              {cooldown > 0 ? `RESEND IN ${cooldown}S` : "RESEND CODE"}
            </button>
            <button
              className="text-button"
              type="button"
              disabled={pending}
              onClick={() => setCodePhase("REQUEST")}
            >
              CHANGE EMAIL
            </button>
          </div>
        </form>
      )}

      <p className="auth-route-link">
        NEW HUNTER? <Link href="/register">CREATE ACCOUNT</Link>
      </p>
    </div>
  );
}
