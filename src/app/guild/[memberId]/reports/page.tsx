import Link from "next/link";
import { Avatar } from "@/components/profile/avatar";
import { notFound } from "next/navigation";

import { AuthenticatedHeader } from "@/components/layout/authenticated-header";
import { SystemPanel } from "@/components/system/system-panel";
import { requirePageOwner } from "@/server/auth/request-auth";
import { AppError } from "@/server/errors/app-error";
import { validateGuildId } from "@/server/guild/guild-route";
import { getGuildMemberReportListProjection } from "@/server/services/guild-projection-service";

export default async function GuildReportsPage({
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
  let result;
  try {
    result = await getGuildMemberReportListProjection(owner.id, memberId);
  } catch (error) {
    if (
      error instanceof AppError &&
      [
        "GUILD_ACCESS_DENIED",
        "GUILD_MEMBER_NOT_FOUND",
        "GUILD_SHARING_DISABLED",
      ].includes(error.code)
    ) {
      notFound();
    }
    throw error;
  }
  if (result.kind !== "AVAILABLE") notFound();
  const reports = [...(result.current ? [result.current] : []), ...result.finalized];
  return (
    <main className="app-shell">
      <div className="app-frame app-frame--wide guild-page">
        <AuthenticatedHeader
          displayName={owner.displayName}
          section="GUILD REPORTS"
          active="GUILD"
        />
        <div className="page-heading">
          <p>SHARED EVALUATION // APPROVED FIELDS</p>
          <div className="guild-member-heading">
            <Avatar avatarKey={result.member.avatarKey} size={48} />
            <h1>{result.member.displayName}</h1>
          </div>
        </div>
        <SystemPanel eyebrow="GUILD // WEEKLY RECORD" title="WEEKLY REPORTS" glow>
          {reports.length ? (
            <div className="guild-report-list">
              {reports.map((report) => (
                <Link
                  key={report.challengeWeek}
                  href={`/guild/${memberId}/reports/week/${report.challengeWeek}`}
                >
                  <span>WEEK {report.challengeWeek}</span>
                  <strong>{report.evaluation ?? "PENDING"}</strong>
                  <small>
                    {report.weekStartDate} — {report.weekEndDate}
                    {" // ARC SCORE "}
                    {report.arcScore === null ? "—" : report.arcScore.toFixed(0)}
                  </small>
                </Link>
              ))}
            </div>
          ) : (
            <p className="empty-state">NO SHARED REPORTS AVAILABLE</p>
          )}
          <p className="guild-privacy-note">
            Recovery history, raw progression events, workout notes, and unapproved
            sensitive sections are omitted by the server.
          </p>
        </SystemPanel>
        <Link
          className="system-status-action guild-back-link"
          href={`/guild/${memberId}`}
        >
          ← RETURN TO MEMBER
        </Link>
      </div>
    </main>
  );
}
