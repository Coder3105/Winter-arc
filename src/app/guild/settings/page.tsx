import Link from "next/link";

import { GuildSharingSettingsForm } from "@/components/guild/guild-sharing-settings";
import { AuthenticatedHeader } from "@/components/layout/authenticated-header";
import { SystemPanel } from "@/components/system/system-panel";
import { requirePageOwner } from "@/server/auth/request-auth";
import { getGuildSharingPreferences } from "@/server/services/guild-sharing-service";

export default async function GuildSettingsPage() {
  const owner = await requirePageOwner();
  const settings = await getGuildSharingPreferences(owner.id);
  return (
    <main className="app-shell">
      <div className="app-frame app-frame--wide guild-page">
        <AuthenticatedHeader
          displayName={owner.displayName}
          section="GUILD PRIVACY"
          active="GUILD"
        />
        <div className="page-heading">
          <p>OWNER AUTHORITY // LIVE POLICY</p>
          <h1>GUILD SHARING</h1>
        </div>
        <SystemPanel eyebrow="PRIVATE BY DESIGN" title="SHARING POLICY" glow>
          <GuildSharingSettingsForm initial={settings} />
        </SystemPanel>
        <Link className="system-status-action guild-back-link" href="/guild">
          ← RETURN TO GUILD
        </Link>
      </div>
    </main>
  );
}
