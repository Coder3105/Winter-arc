import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { SystemHeader } from "@/components/system/system-header";
import { SystemPanel } from "@/components/system/system-panel";
import { safeInternalRedirect } from "@/lib/auth/client-session";
import { getCurrentOwner } from "@/server/auth/request-auth";

export default async function LoginPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly next?: string | string[] }>;
}) {
  const owner = await getCurrentOwner();
  if (owner) {
    redirect("/");
  }
  const next = (await searchParams).next;
  const redirectTo = safeInternalRedirect(typeof next === "string" ? next : null);

  return (
    <main className="access-shell">
      <section className="access-screen" aria-labelledby="access-title">
        <SystemHeader title="WINTER ARC" label="SYSTEM // ACCESS" />
        <div className="access-intro">
          <p className="phase-marker phase-marker--centered">SECURE OWNER CHANNEL</p>
          <h1 id="access-title">SYSTEM ACCESS</h1>
          <p>IDENTITY VERIFICATION REQUIRED</p>
        </div>
        <SystemPanel eyebrow="AUTH // 001" title="OWNER LOGIN" glow>
          <LoginForm redirectTo={redirectTo} />
        </SystemPanel>
        <p className="access-footer">AUTHORIZED OWNER ACCESS ONLY</p>
      </section>
    </main>
  );
}
