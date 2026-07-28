export default function HomePage() {
  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem", maxWidth: "48rem" }}>
      <h1>Dharwin Backend (Next.js)</h1>
      <p>
        Primary API: <code>npm run dev:8787</code> (port <strong>8787</strong>). This Next.js app is the
        whole backend — the legacy Python studio has been removed.
      </p>
      <ul>
        <li>
          <a href="/api/health">GET /api/health</a>
        </li>
        <li>
          <a href="/api/ping">GET /api/ping</a>
        </li>
        <li>
          <code>GET /api/sites</code> — Phase 1 static sites (auth required)
        </li>
        <li>
          <code>GET /api/builder/**</code> — retired HTML builder (410 Gone)
        </li>
      </ul>
      <p>
        Telephony sidecar: <code>npm run telephony</code> (port 8788)
      </p>
    </main>
  );
}
