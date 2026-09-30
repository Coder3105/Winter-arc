"use client";

export default function GlobalError({ retry }: { readonly retry: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          margin: 0,
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: "#010306",
          color: "#f2fbff",
          fontFamily: '"Segoe UI", sans-serif',
        }}
      >
        <main style={{ width: "min(100%, 560px)", textAlign: "center" }}>
          <p style={{ color: "#8de7ff", letterSpacing: "0.18em" }}>SYSTEM</p>
          <h1 style={{ fontFamily: "Georgia, serif", letterSpacing: "0.08em" }}>
            CRITICAL INTERFACE ERROR
          </h1>
          <p style={{ color: "#a8c3d1", lineHeight: 1.6 }}>
            Winter Arc could not render this view. No private data was cached.
          </p>
          <button
            type="button"
            onClick={retry}
            style={{
              minHeight: 44,
              padding: "0 24px",
              border: "1px solid #8de7ff",
              background: "#07111b",
              color: "#dff9ff",
              cursor: "pointer",
            }}
          >
            RETRY SYSTEM
          </button>
        </main>
      </body>
    </html>
  );
}
