import Link from "next/link";
import { AuthenticatedHeader } from "@/components/layout/authenticated-header";
import { AvatarPicker } from "@/components/profile/avatar-picker";
import { SystemPanel } from "@/components/system/system-panel";
import { requirePageOwner } from "@/server/auth/request-auth";
import { getProfile } from "@/server/services/profile-service";
export default async function AvatarPage() {
  const owner = await requirePageOwner();
  const profile = await getProfile(owner.id);
  return (
    <main className="app-shell">
      <div className="app-frame app-frame--wide avatar-page">
        <AuthenticatedHeader
          displayName={owner.displayName}
          section="SYSTEM IDENTITY"
          active="PROFILE"
        />
        <div className="page-heading">
          <p>IDENTITY // YOUR CHOICE</p>
          <h1>SELECT AVATAR</h1>
        </div>
        <SystemPanel eyebrow="WINTER ARC // ORIGINAL PORTRAITS" title="AVATAR CATALOGUE">
          {profile ? (
            <AvatarPicker initialAvatarKey={profile.avatarKey} />
          ) : (
            <p>
              Complete your <Link href="/setup">profile setup</Link> before choosing an
              avatar.
            </p>
          )}
        </SystemPanel>
        <Link className="system-status-action avatar-back-link" href="/profile">
          RETURN TO PROFILE
        </Link>
      </div>
    </main>
  );
}
