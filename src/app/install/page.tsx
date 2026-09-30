import Link from "next/link";

import { InstallGuide } from "@/components/pwa/install-guide";
import { SystemPanel } from "@/components/system/system-panel";

export default function InstallPage() {
  return (
    <main className="app-shell install-page">
      <div className="app-frame">
        <div className="page-heading">
          <p>SYSTEM // SECURE INSTALLATION</p>
          <h1>INSTALL WINTER ARC</h1>
        </div>
        <SystemPanel eyebrow="PWA // DEVICE" title="HOME SCREEN ACCESS" glow>
          <InstallGuide />
        </SystemPanel>
        <Link className="system-status-action" href="/">
          RETURN TO SYSTEM →
        </Link>
      </div>
    </main>
  );
}
