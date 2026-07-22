export default function HomePage() {
  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem", maxWidth: "48rem" }}>
      <h1>Dharwin Backend (Next.js)</h1>
      <p>
        Primary API: <code>npm run dev:8787</code> (port <strong>8787</strong>, FastAPI path parity via rewrites).
        Parallel mode: <code>npm run dev</code> on <strong>8790</strong>. Python studio (
        <code>npm run studio:python</code>) is harness-only until Phase D.
      </p>
      <ul>
        <li>
          <a href="/api/health">GET /api/health</a>
        </li>
        <li>
          <a href="/api/ping">GET /api/ping</a>
        </li>
        <li>
          <code>GET /api/projects</code> — legacy file-based projects (auth required)
        </li>
        <li>
          <code>GET /api/builder/projects</code> — Postgres builder projects (auth required)
        </li>
      </ul>
      <p>
        Telephony sidecar: <code>npm run telephony</code> (port 8788)
      </p>
    </main>
  );
}
