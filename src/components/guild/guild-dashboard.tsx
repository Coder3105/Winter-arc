"use client";

import Link from "next/link";
import { useState } from "react";

import { SystemPanel } from "@/components/system/system-panel";
import { Avatar } from "@/components/profile/avatar";
import { redirectExpiredSession } from "@/lib/auth/client-session";
import type { listGuildInvites } from "@/server/services/guild-invite-service";
import type { getGuildMemberListProjection } from "@/server/services/guild-projection-service";

type Invites = Awaited<ReturnType<typeof listGuildInvites>>;
type Members = Awaited<ReturnType<typeof getGuildMemberListProjection>>;

interface ApiEnvelope<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: { readonly message?: string };
}

function formatGuildDate(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 10);
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (redirectExpiredSession(response)) throw new Error("SESSION EXPIRED");
  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !payload.success || payload.data === undefined) {
    throw new Error(payload.error?.message ?? "GUILD REQUEST INTERRUPTED");
  }
  return payload.data;
}

export function GuildDashboard({
  initialInvites,
  initialMembers,
}: {
  readonly initialInvites: Invites;
  readonly initialMembers: Members;
}) {
  const [invites, setInvites] = useState(initialInvites);
  const [members, setMembers] = useState(initialMembers);
  const [email, setEmail] = useState("");
  const [activeInviteId, setActiveInviteId] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const [nextInvites, nextMembers] = await Promise.all([
      api<Invites>("/api/v1/guild/invites"),
      api<Members>("/api/v1/guild/members"),
    ]);
    setInvites(nextInvites);
    setMembers(nextMembers);
  }

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "GUILD REQUEST INTERRUPTED");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="guild-dashboard">
      <SystemPanel eyebrow="SYSTEM NETWORK // INVITE" title="ADD MEMBER" glow>
        <form
          className="guild-invite-form"
          onSubmit={(event) => {
            event.preventDefault();
            void run("send", async () => {
              const result = await api<{ readonly inviteId: string }>(
                "/api/v1/guild/invites",
                {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ email }),
                },
              );
              setEmail("");
              setOtp("");
              setActiveInviteId(result.inviteId);
              setMessage(
                "CODE SENT TO THE MEMBER. ASK THEM FOR THE CODE, THEN VERIFY IT BELOW.",
              );
              await refresh();
            });
          }}
        >
          <label>
            <span>EMAIL ADDRESS</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              maxLength={320}
              value={email}
              disabled={busy !== null}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="hunter@example.com"
            />
          </label>
          <button className="system-button" type="submit" disabled={busy !== null}>
            {busy === "send" ? "TRANSMITTING…" : "SEND GUILD INVITATION"}
          </button>
        </form>
        <p className="guild-privacy-note">
          Invitations are available only for existing Winter Arc accounts. The member
          receives a code and gives it to you only if they approve the connection.
        </p>
      </SystemPanel>

      {message ? (
        <p className="guild-feedback guild-feedback--success">{message}</p>
      ) : null}
      {error ? (
        <p className="guild-feedback guild-feedback--error" role="alert">
          {error}
        </p>
      ) : null}

      <SystemPanel eyebrow="ACTIVE LINKS // PRIVATE" title="GUILD MEMBERS">
        {members.length ? (
          <div className="guild-member-list">
            {members.map((member) => (
              <article key={member.userId} className="guild-member-card">
                <Avatar avatarKey={member.avatarKey} size={48} />
                <div>
                  <strong>{member.displayName}</strong>
                  <span>{member.selectedTitle ?? "SYSTEM HUNTER"}</span>
                  <small>
                    {member.progression
                      ? `RANK ${member.progression.rank} // LEVEL ${member.progression.level}`
                      : "PROGRESSION PRIVATE"}
                  </small>
                </div>
                <Link className="secondary-button" href={`/guild/${member.userId}`}>
                  VIEW
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="guild-empty-state">
            <strong>NO MEMBERS CONNECTED</strong>
            <p>Invite a friend using their verified email.</p>
          </div>
        )}
      </SystemPanel>

      <div className="guild-request-grid">
        <SystemPanel eyebrow="REQUESTS // RECEIVED" title="INCOMING">
          {invites.incoming.length ? (
            <div className="guild-request-list">
              {invites.incoming.map((invite) => (
                <article key={invite.id} className="guild-request-card">
                  <div>
                    <strong>{invite.inviter.displayName}</strong>
                    <span>
                      EXPIRES{" "}
                      <time dateTime={invite.expiresAt}>
                        {formatGuildDate(invite.expiresAt)}
                      </time>
                    </span>
                  </div>
                  <button
                    className="secondary-button guild-danger-action"
                    type="button"
                    disabled={busy !== null}
                    onClick={() =>
                      void run(`decline:${invite.id}`, async () => {
                        await api(`/api/v1/guild/invites/${invite.id}/decline`, {
                          method: "POST",
                        });
                        await refresh();
                      })
                    }
                  >
                    DECLINE
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">NO INCOMING REQUESTS</p>
          )}
        </SystemPanel>

        <SystemPanel eyebrow="REQUESTS // SENT" title="OUTGOING">
          {invites.outgoing.length ? (
            <div className="guild-request-list">
              {invites.outgoing.map((invite) => (
                <article key={invite.id} className="guild-request-card">
                  <div>
                    <strong>{invite.targetEmailMasked}</strong>
                    <span>
                      PENDING //{" "}
                      <time dateTime={invite.expiresAt}>
                        {formatGuildDate(invite.expiresAt)}
                      </time>
                    </span>
                  </div>
                  {activeInviteId === invite.id ? (
                    <form
                      className="guild-otp-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void run(`accept:${invite.id}`, async () => {
                          if (!invite.verification.requestId) {
                            throw new Error("SEND A NEW CODE BEFORE VERIFYING");
                          }
                          await api(`/api/v1/guild/invites/${invite.id}/accept`, {
                            method: "POST",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({
                              requestId: invite.verification.requestId,
                              otp,
                            }),
                          });
                          setActiveInviteId(null);
                          setOtp("");
                          setMessage("GUILD LINK ESTABLISHED");
                          await refresh();
                        });
                      }}
                    >
                      <label>
                        <span>CODE FROM MEMBER</span>
                        <input
                          value={otp}
                          onChange={(event) =>
                            setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
                          }
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          pattern="\d{6}"
                          minLength={6}
                          maxLength={6}
                          required
                          disabled={busy !== null}
                          placeholder="000000"
                        />
                      </label>
                      <div className="guild-action-row">
                        <button
                          className="system-button"
                          type="submit"
                          disabled={busy !== null || !invite.verification.requestId}
                        >
                          VERIFY &amp; CONNECT
                        </button>
                        <button
                          className="secondary-button"
                          type="button"
                          disabled={busy !== null}
                          onClick={() =>
                            void run(`resend:${invite.id}`, async () => {
                              await api(`/api/v1/guild/invites/${invite.id}/resend`, {
                                method: "POST",
                              });
                              setOtp("");
                              setMessage("NEW CODE SENT TO THE MEMBER");
                              await refresh();
                            })
                          }
                        >
                          SEND NEW CODE
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="guild-action-row">
                      <button
                        className="system-button"
                        type="button"
                        disabled={busy !== null}
                        onClick={() => {
                          setOtp("");
                          setActiveInviteId(invite.id);
                        }}
                      >
                        ENTER CODE
                      </button>
                      <button
                        className="secondary-button guild-danger-action"
                        type="button"
                        disabled={busy !== null}
                        onClick={() =>
                          void run(`cancel:${invite.id}`, async () => {
                            await api(`/api/v1/guild/invites/${invite.id}`, {
                              method: "DELETE",
                            });
                            await refresh();
                          })
                        }
                      >
                        CANCEL
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">NO OUTGOING REQUESTS</p>
          )}
        </SystemPanel>
      </div>

      <Link className="system-status-action guild-settings-link" href="/guild/settings">
        GUILD SHARING SETTINGS →
      </Link>
    </div>
  );
}
