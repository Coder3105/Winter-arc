import { SystemPanel } from "@/components/system/system-panel";

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
          <div className="system-skeleton" role="status" aria-label={message}>
            <span />
            <span />
            <span />
            <p>{message}</p>
          </div>
        </SystemPanel>
      </div>
    </main>
  );
}
