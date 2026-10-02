import { GuildDashboard } from "@/components/guild/guild-dashboard";
import { AuthenticatedHeader } from "@/components/layout/authenticated-header";
import { requirePageOwner } from "@/server/auth/request-auth";
import { listGuildInvites } from "@/server/services/guild-invite-service";
import { getGuildMemberListProjection } from "@/server/services/guild-projection-service";

export default async function GuildPage() {
  const owner = await requirePageOwner();
  const [invites, members] = await Promise.all([
    listGuildInvites(owner),
    getGuildMemberListProjection(owner.id),
  ]);
  return (
    <main className="app-shell">
      <div className="app-frame app-frame--wide guild-page">
        <AuthenticatedHeader
          displayName={owner.displayName}
          section="SYSTEM NETWORK"
          active="GUILD"
        />
        <div className="page-heading">
          <p>PRIVATE LINKS // APPROVED SHARING</p>
          <h1>GUILD</h1>
        </div>
        <GuildDashboard initialInvites={invites} initialMembers={members} />
      </div>
    </main>
  );
}
