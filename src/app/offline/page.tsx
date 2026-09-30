import Link from "next/link";

export default function OfflinePage() {
  return (
    <main className="system-shell">
      <div className="foundation-screen offline-screen">
        <p className="phase-marker">SYSTEM</p>
        <div className="offline-content">
          <span>CONNECTION LOST</span>
          <h1>OFFLINE</h1>
          <p>
            Winter Arc requires a secure connection to access private tracking data. Your
            private health and habit records are not stored in the PWA cache.
          </p>
          <Link className="system-button" href="/" data-offline-allowed>
            RETRY CONNECTION
          </Link>
        </div>
      </div>
    </main>
  );
}
