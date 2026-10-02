import Link from "next/link";
import Image from "next/image";

import { InstallGuide } from "@/components/pwa/install-guide";
import { SystemPanel } from "@/components/system/system-panel";

export default function InstallPage() {
  return (
    <main className="app-shell install-page">
      <div className="app-frame">
        <div className="page-heading">
          <Image
            className="install-brand-mark"
            src="/icons/system-mark.svg"
            alt=""
            width={56}
            height={56}
            sizes="56px"
          />
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
