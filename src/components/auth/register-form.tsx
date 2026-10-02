"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

interface RequestResult {
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

export function RegisterForm() {
  const router = useRouter();
  const [phase, setPhase] = useState<"ACCOUNT" | "VERIFY">("ACCOUNT");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [otp, setOtp] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(
      () => setCooldown((current) => Math.max(0, current - 1)),
      1_000,
    );
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function requestCode(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (pending || cooldown > 0) return;
    if (password.length < 12) {
      setError("Password must contain at least 12 characters.");
      return;
    }
    if (password !== confirmation) {
      setError("Password confirmation does not match.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/auth/register/request-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        setError(
          await readFailure(response, "The verification code could not be requested."),
        );
        return;
      }
      const body = (await response.json()) as { readonly data: RequestResult };
      setRequestId(body.data.requestId);
      setCooldown(body.data.resendAvailableInSeconds);
      setPhase("VERIFY");
    } catch {
      setError("Account verification is temporarily unavailable.");
    } finally {
      setPending(false);
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requestId) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/auth/register/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, requestId, otp }),
      });
      if (!response.ok) {
        setError(
          await readFailure(response, "The authentication code is invalid or expired."),
        );
        return;
      }
      router.replace("/setup");
      router.refresh();
    } catch {
      setError("Account creation is temporarily unavailable.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="auth-control">
      {phase === "ACCOUNT" ? (
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
          <label className="system-field">
            <span>PASSWORD // 12+ CHARACTERS</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={256}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <label className="system-field">
            <span>CONFIRM PASSWORD</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={256}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              required
            />
          </label>
          {error && (
            <p className="form-message form-message--error" role="alert">
              {error}
            </p>
          )}
          <button className="system-button" type="submit" disabled={pending}>
            {pending ? "SENDING" : "VERIFY EMAIL"}
          </button>
        </form>
      ) : (
        <form className="system-form" onSubmit={verify}>
          <p className="auth-address">VERIFICATION SENT // {email}</p>
          <label className="system-field">
            <span>6-DIGIT VERIFICATION CODE</span>
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
          <p className="form-message" role="status">
            Code expires in 10 minutes. Your password remains only in this page until
            verification succeeds.
          </p>
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
            {pending ? "CREATING ACCOUNT" : "CREATE ACCOUNT"}
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
              onClick={() => {
                setPhase("ACCOUNT");
                setRequestId(null);
                setOtp("");
                setError(null);
              }}
            >
              EDIT ACCOUNT
            </button>
          </div>
        </form>
      )}
      <p className="auth-route-link">
        ALREADY REGISTERED? <Link href="/login">ENTER SYSTEM</Link>
      </p>
    </div>
  );
}
