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
          <p>
            We could not load this view. Retry the request or review your System
            configuration.
          </p>
          <div>
            <button className="system-button" type="button" onClick={retry}>
              RETRY REQUEST
            </button>
            <Link className="secondary-button" href="/setup">
              REVIEW CONFIGURATION
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
