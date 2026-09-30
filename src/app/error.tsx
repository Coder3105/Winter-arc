"use client";

import Link from "next/link";

export default function AppError({ retry }: { readonly retry: () => void }) {
  return (
    <main className="system-shell">
      <div className="foundation-screen system-fallback">
        <p className="phase-marker">SYSTEM</p>
        <div className="system-fallback__content" role="alert">
          <span>CONNECTION OR SYSTEM FAULT</span>
          <h1>REQUEST INTERRUPTED</h1>
          <p>Your data was not replaced. Retry the request or return to the System.</p>
          <div>
            <button className="system-button" type="button" onClick={retry}>
              RETRY REQUEST
            </button>
            <Link className="secondary-button" href="/">
              RETURN TO SYSTEM
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
