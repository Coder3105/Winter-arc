import { redirect } from "next/navigation";

import { RegisterForm } from "@/components/auth/register-form";
import { SystemHeader } from "@/components/system/system-header";
import { SystemPanel } from "@/components/system/system-panel";
import { getCurrentOwner } from "@/server/auth/request-auth";

export default async function RegisterPage() {
  if (await getCurrentOwner()) redirect("/");

  return (
    <main className="access-shell">
      <section className="access-screen" aria-labelledby="register-title">
        <SystemHeader title="WINTER ARC" label="SYSTEM // INITIALIZATION" />
        <div className="access-intro">
          <p className="phase-marker phase-marker--centered">NEW HUNTER CHANNEL</p>
          <h1 id="register-title">CREATE ACCOUNT</h1>
          <p>VERIFIED IDENTITY REQUIRED</p>
        </div>
        <SystemPanel eyebrow="AUTH // 002" title="EMAIL VERIFICATION" glow>
          <RegisterForm />
        </SystemPanel>
        <p className="access-footer">ONE ACCOUNT // ONE VERIFIED EMAIL</p>
      </section>
    </main>
  );
}
