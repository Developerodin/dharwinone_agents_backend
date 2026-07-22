import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Frontend embeds draft preview iframe from localhost:3000 → 127.0.0.1:8787
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  turbopack: {
    root: projectRoot,
  },
  async rewrites() {
    // Preserve FastAPI path shapes during Python → Next cutover.
    return [
      { source: "/health", destination: "/api/health" },
      { source: "/ping", destination: "/api/ping" },
      { source: "/auth/:path*", destination: "/api/auth/:path*" },
      { source: "/projects", destination: "/api/projects" },
      { source: "/projects/:path*", destination: "/api/projects/:path*" },
      { source: "/builder/:path*", destination: "/api/builder/:path*" },
      { source: "/sites", destination: "/api/sites" },
      // HTML preview renderer lives at app/sites/preview/* — must not rewrite to /api/sites/*
      {
        source: "/sites/:path((?!preview/).*)",
        destination: "/api/sites/:path*",
      },
      { source: "/categories", destination: "/api/categories" },
      { source: "/templates", destination: "/api/templates" },
      { source: "/templates/:path*", destination: "/api/templates/:path*" },
      { source: "/tokens/:path*", destination: "/api/tokens/:path*" },
      { source: "/token-packs", destination: "/api/token-packs" },
      { source: "/public/sites/:path*", destination: "/api/public/sites/:path*" },
      { source: "/runs", destination: "/api/runs" },
      { source: "/runs/:path*", destination: "/api/runs/:path*" },
    ];
  },
};

export default nextConfig;
