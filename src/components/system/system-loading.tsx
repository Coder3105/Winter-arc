import { SystemPanel } from "@/components/system/system-panel";
import { BeruLoader } from "./beru-loader";

export function SystemLoading({
  eyebrow,
  title,
  message,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly message: string;
}) {
  return (
    <main className="app-shell" aria-busy="true">
      <div className="app-frame app-frame--wide system-loading-page">
        <div className="page-heading">
          <p>{eyebrow}</p>
          <h1>{title}</h1>
        </div>
        <SystemPanel eyebrow="SYSTEM // SYNCING" title={title} glow>
          <BeruLoader message={message} />
        </SystemPanel>
      </div>
    </main>
  );
}
