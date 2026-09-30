import { AuthenticatedHeader } from "@/components/layout/authenticated-header";
import { SetupFlow } from "@/components/setup/setup-flow";
import { requirePageOwner } from "@/server/auth/request-auth";
import { getBaselineAssessment } from "@/server/services/body-composition-service";
import { getProfile } from "@/server/services/profile-service";
import { getWinterArcConfig } from "@/server/services/winter-arc-service";

export default async function SetupPage() {
  const owner = await requirePageOwner();
  const [profile, config, baseline] = await Promise.all([
    getProfile(owner.id),
    getWinterArcConfig(owner.id),
    getBaselineAssessment(owner.id),
  ]);

  return (
    <main className="app-shell">
      <div className="app-frame app-frame--wide">
        <AuthenticatedHeader
          displayName={owner.displayName}
          section="SYSTEM CONFIGURATION"
        />
        <div className="page-heading">
          <p>PHASE 02 // OWNER PROTOCOL</p>
          <h1>SYSTEM CONFIGURATION</h1>
        </div>
        <SetupFlow initialProfile={profile} initialConfig={config} baseline={baseline} />
      </div>
    </main>
  );
}
