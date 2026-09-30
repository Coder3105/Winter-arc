import { AuthenticatedHeader } from "@/components/layout/authenticated-header";
import { ProgressDashboard } from "@/components/progress/progress-dashboard";
import { SystemPanel } from "@/components/system/system-panel";
import { requirePageOwner } from "@/server/auth/request-auth";
import { getWeightAnalytics } from "@/server/services/weight-service";

export default async function ProgressPage() {
  const owner = await requirePageOwner();
  const analytics = await getWeightAnalytics(owner.id);
  return (
    <main className="app-shell">
      <div className="app-frame app-frame--wide progress-page">
        <AuthenticatedHeader
          displayName={owner.displayName}
          section="TRANSFORMATION STATUS"
          active="PROGRESS"
        />
        <div className="page-heading">
          <p>SYSTEM // TRANSFORMATION DATA</p>
          <h1>TRANSFORMATION STATUS</h1>
        </div>
        {analytics.kind === "AVAILABLE" ? (
          <ProgressDashboard analytics={analytics} />
        ) : (
          <SystemPanel
            eyebrow="PROGRESS // UNAVAILABLE"
            title="TRANSFORMATION STATUS"
            glow
          >
            <div className="quest-unavailable">
              <strong>
                {analytics.reason === "PROFILE_REQUIRED"
                  ? "COMPLETE OWNER PROFILE SETUP"
                  : "CONFIGURE YOUR WINTER ARC"}
              </strong>
              <p>
                Progress requires an explicit profile timezone and Winter Arc
                configuration.
              </p>
            </div>
          </SystemPanel>
        )}
      </div>
    </main>
  );
}
