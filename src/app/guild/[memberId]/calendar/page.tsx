import Link from "next/link";
import { notFound } from "next/navigation";

import { GuildCalendar } from "@/components/guild/guild-calendar";
import { AuthenticatedHeader } from "@/components/layout/authenticated-header";
import { calendarMonthSchema } from "@/lib/validation/calendar-history";
import { requirePageOwner } from "@/server/auth/request-auth";
import { AppError } from "@/server/errors/app-error";
import { validateGuildId } from "@/server/guild/guild-route";
import { getGuildMemberCalendarProjection } from "@/server/services/guild-projection-service";

export default async function GuildCalendarPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ memberId: string }>;
  readonly searchParams: Promise<{ month?: string | string[] }>;
}) {
  const owner = await requirePageOwner();
  const { memberId: rawMemberId } = await params;
  let memberId: string;
  try {
    memberId = validateGuildId(rawMemberId);
  } catch {
    notFound();
  }
  const requested = (await searchParams).month;
  const parsed = calendarMonthSchema.safeParse(
    typeof requested === "string" ? requested : new Date().toISOString().slice(0, 7),
  );
  if (!parsed.success) notFound();
  let calendar;
  try {
    calendar = await getGuildMemberCalendarProjection(owner.id, memberId, parsed.data);
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
  if (calendar.kind !== "AVAILABLE") notFound();
  return (
    <main className="app-shell">
      <div className="app-frame app-frame--wide guild-page">
        <AuthenticatedHeader
          displayName={owner.displayName}
          section="GUILD CALENDAR"
          active="GUILD"
        />
        <div className="page-heading">
          <p>SHARED HISTORY // SANITIZED</p>
          <h1>{calendar.member.displayName}</h1>
        </div>
        <GuildCalendar memberId={memberId} initialCalendar={calendar} />
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
