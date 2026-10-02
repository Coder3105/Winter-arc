import { redirect } from "next/navigation";

import { AuthenticatedHeader } from "@/components/layout/authenticated-header";
import { SetupFlow } from "@/components/setup/setup-flow";
import { requirePageOwner } from "@/server/auth/request-auth";
import { getOnboardingDraft } from "@/server/services/onboarding-service";
import { getSetupState } from "@/server/services/setup-service";

export default async function SetupPage() {
  const owner = await requirePageOwner();
  const setup = await getSetupState(owner.id);
  if (setup.complete) redirect("/today");
  const draft = await getOnboardingDraft(owner.id);

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
        <SetupFlow email={owner.email} initialDraft={draft} />
      </div>
    </main>
  );
}
