import Link from "next/link";
import { notFound } from "next/navigation";

import { GuildMemberActions } from "@/components/guild/guild-member-actions";
import { Avatar } from "@/components/profile/avatar";
import { AuthenticatedHeader } from "@/components/layout/authenticated-header";
import { SystemPanel } from "@/components/system/system-panel";
import { requirePageOwner } from "@/server/auth/request-auth";
import { AppError } from "@/server/errors/app-error";
import { validateGuildId } from "@/server/guild/guild-route";
import { getGuildMemberProfileProjection } from "@/server/services/guild-projection-service";

export default async function GuildMemberPage({
  params,
}: {
  readonly params: Promise<{ memberId: string }>;
}) {
  const owner = await requirePageOwner();
  const { memberId: rawMemberId } = await params;
  let memberId: string;
  try {
    memberId = validateGuildId(rawMemberId);
  } catch {
    notFound();
  }
  let member;
  try {
    member = await getGuildMemberProfileProjection(owner.id, memberId);
  } catch (error) {
    if (
      error instanceof AppError &&
      ["GUILD_ACCESS_DENIED", "GUILD_MEMBER_NOT_FOUND", "VALIDATION_ERROR"].includes(
        error.code,
      )
    ) {
      notFound();
    }
    throw error;
  }

  return (
    <main className="app-shell">
      <div className="app-frame app-frame--wide guild-page">
        <AuthenticatedHeader
          displayName={owner.displayName}
          section="GUILD MEMBER"
          active="GUILD"
        />
        <div className="page-heading">
          <p>SYSTEM NETWORK // FRIEND-SAFE PROFILE</p>
          <h1>GUILD MEMBER</h1>
        </div>
        <SystemPanel
          eyebrow="ACTIVE LINK // VERIFIED"
          title={member.identity.displayName}
          glow
        >
          <div className="guild-member-hero">
            <Avatar avatarKey={member.identity.avatarKey} size={96} eager />
            <div>
              <span>TITLE</span>
              <strong>{member.identity.selectedTitle ?? "SYSTEM HUNTER"}</strong>
            </div>
          </div>
          <dl className="detail-list detail-list--columns guild-member-metrics">
            <div>
              <dt>RANK</dt>
              <dd>{member.progression?.rank ?? "PRIVATE"}</dd>
            </div>
            <div>
              <dt>LEVEL</dt>
              <dd>{member.progression?.level ?? "PRIVATE"}</dd>
            </div>
            <div>
              <dt>ARC STATUS</dt>
              <dd>
                {member.summary?.challengeDay
                  ? `DAY ${member.summary.challengeDay}`
                  : (member.summary?.challengeStatus ?? "PRIVATE")}
              </dd>
            </div>
            <div>
              <dt>PERFECT DAY STREAK</dt>
              <dd>{member.summary?.currentPerfectDayStreak ?? "PRIVATE"}</dd>
            </div>
            <div>
              <dt>WORKOUT STREAK</dt>
              <dd>
                {member.summary?.currentWorkoutWeekStreak === null ||
                member.summary?.currentWorkoutWeekStreak === undefined
                  ? "PRIVATE"
                  : `${member.summary.currentWorkoutWeekStreak} WEEKS`}
              </dd>
            </div>
            <div>
              <dt>LATEST ARC SCORE</dt>
              <dd>
                {member.summary?.latestArcScore === null ||
                member.summary?.latestArcScore === undefined
                  ? "PRIVATE"
                  : member.summary.latestArcScore.toFixed(0)}
              </dd>
            </div>
          </dl>
          <div className="guild-profile-links">
            {member.access.calendar ? (
              <Link className="system-button" href={`/guild/${memberId}/calendar`}>
                CALENDAR
              </Link>
            ) : (
              <span className="guild-private-link">CALENDAR // PRIVATE</span>
            )}
            {member.access.weeklyReports ? (
              <Link className="system-button" href={`/guild/${memberId}/reports`}>
                REPORTS
              </Link>
            ) : (
              <span className="guild-private-link">REPORTS // PRIVATE</span>
            )}
          </div>
          <p className="guild-privacy-note">
            Email, physical profile, exact weight, body composition, private notes,
            sessions, and raw Daily Quest responses are not part of this profile.
          </p>
        </SystemPanel>
        <SystemPanel eyebrow="CONNECTION // OWNER ACTION" title="LINK CONTROL">
          <GuildMemberActions memberId={memberId} />
        </SystemPanel>
        <Link className="system-status-action guild-back-link" href="/guild">
          ← RETURN TO GUILD
        </Link>
      </div>
    </main>
  );
}
