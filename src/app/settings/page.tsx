import Link from "next/link";

import { AuthenticatedHeader } from "@/components/layout/authenticated-header";
import { SystemPanel } from "@/components/system/system-panel";
import { requirePageOwner } from "@/server/auth/request-auth";

const SETTINGS = [
  {
    href: "/profile",
    title: "OWNER PROFILE",
    description: "Review identity, protocol, source data, and connected Guild members.",
  },
  {
    href: "/profile/avatar",
    title: "AVATAR",
    description: "Choose the portrait used for your System identity.",
  },
  {
    href: "/profile/notifications",
    title: "NOTIFICATIONS",
    description: "Configure in-app, Web Push, and Daily Quest email preferences.",
  },
  {
    href: "/guild/settings",
    title: "GUILD PRIVACY",
    description: "Control which sanitized projections approved members may view.",
  },
  {
    href: "/install",
    title: "INSTALL SYSTEM",
    description: "Review PWA installation and device requirements.",
  },
] as const;

export default async function SettingsPage() {
  const owner = await requirePageOwner();
  return (
    <main className="app-shell">
      <div className="app-frame app-frame--wide settings-page">
        <AuthenticatedHeader
          displayName={owner.displayName}
          section="SYSTEM SETTINGS"
          active="CONFIGURATION"
        />
        <div className="page-heading">
          <p>OWNER // PRIVACY // DEVICE</p>
          <h1>SYSTEM SETTINGS</h1>
        </div>
        <div className="settings-grid">
          {SETTINGS.map((setting) => (
            <SystemPanel eyebrow="CONFIGURATION" title={setting.title} key={setting.href}>
              <p>{setting.description}</p>
              <Link className="system-status-action" href={setting.href}>
                OPEN {setting.title}
              </Link>
            </SystemPanel>
          ))}
        </div>
      </div>
    </main>
  );
}
