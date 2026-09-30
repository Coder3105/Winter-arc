import { CalendarHistory } from "@/components/calendar/calendar-history";
import { AuthenticatedHeader } from "@/components/layout/authenticated-header";
import { SystemPanel } from "@/components/system/system-panel";
import { calendarMonthSchema } from "@/lib/validation/calendar-history";
import { requirePageOwner } from "@/server/auth/request-auth";
import {
  getCalendarMonthHistory,
  getInitialCalendarMonth,
  getStreakHistory,
} from "@/server/services/history-service";

export default async function CalendarPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly month?: string | string[] }>;
}) {
  const owner = await requirePageOwner();
  const requested = (await searchParams).month;
  const parsedRequested = calendarMonthSchema.safeParse(
    typeof requested === "string" ? requested : null,
  );
  const initialMonth = parsedRequested.success
    ? parsedRequested.data
    : await getInitialCalendarMonth(owner.id);
  const streaks = await getStreakHistory(owner.id);

  return (
    <main className="app-shell">
      <div className="app-frame app-frame--wide calendar-page">
        <AuthenticatedHeader
          displayName={owner.displayName}
          section="WINTER ARC RECORD"
          active="CALENDAR"
        />
        <div className="page-heading">
          <p>SYSTEM // HISTORY // STREAKS</p>
          <h1>WINTER ARC RECORD</h1>
        </div>
        {initialMonth && streaks.kind === "AVAILABLE" ? (
          <CalendarLoader ownerId={owner.id} month={initialMonth} streaks={streaks} />
        ) : (
          <SystemPanel eyebrow="HISTORY // UNAVAILABLE" title="CALENDAR" glow>
            <div className="quest-unavailable">
              <strong>
                {streaks.kind === "UNAVAILABLE" && streaks.reason === "PROFILE_REQUIRED"
                  ? "COMPLETE OWNER PROFILE SETUP"
                  : "ACTIVATE YOUR WINTER ARC IN SETUP"}
              </strong>
              <p>
                The calendar requires an explicit profile timezone and active protocol
                start date.
              </p>
            </div>
          </SystemPanel>
        )}
      </div>
    </main>
  );
}

async function CalendarLoader({
  ownerId,
  month,
  streaks,
}: {
  readonly ownerId: string;
  readonly month: string;
  readonly streaks: Awaited<ReturnType<typeof getStreakHistory>> & { kind: "AVAILABLE" };
}) {
  const calendar = await getCalendarMonthHistory(ownerId, month);
  if (calendar.kind !== "AVAILABLE") return null;
  return <CalendarHistory initialCalendar={calendar} streaks={streaks} />;
}
