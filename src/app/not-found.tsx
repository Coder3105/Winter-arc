import Link from "next/link";

export default function NotFound() {
  return (
    <main className="system-shell">
      <div className="foundation-screen system-fallback">
        <p className="phase-marker">SYSTEM</p>
        <div className="system-fallback__content">
          <span>404 // UNKNOWN ROUTE</span>
          <h1>RECORD NOT FOUND</h1>
          <p>The requested System route or record does not exist.</p>
          <Link className="system-button" href="/">
            RETURN TO SYSTEM
          </Link>
        </div>
      </div>
    </main>
  );
}
