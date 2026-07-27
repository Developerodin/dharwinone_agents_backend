// Port of backend/studio/config.py — lives inside backend/ so paths resolve locally.
import path from "node:path";

const DEFAULT_PORT = 8787;

export function backendDir(): string {
  return process.env.STUDIO_BACKEND_DIR || process.cwd();
}

export function dataDir(): string {
  return process.env.STUDIO_DATA || path.join(backendDir(), "data");
}

export function port(): number {
  return parseInt(process.env.STUDIO_PORT || String(DEFAULT_PORT), 10);
}

export function projectsPath(): string {
  return path.join(dataDir(), "projects.json");
}

export function runsDir(projectId: string): string {
  return path.join(dataDir(), "runs", projectId);
}

export function runDir(projectId: string, runId: string): string {
  return path.join(runsDir(projectId), runId);
}

export function statsPath(projectId: string): string {
  return path.join(dataDir(), `${projectId}-stats.json`);
}

export function consentPath(projectId: string): string {
  return path.join(dataDir(), `${projectId}-consent.jsonl`);
}

export function heartbeatIntervalS(): number {
  return parseFloat(process.env.STUDIO_HEARTBEAT_INTERVAL || "10");
}

export function monitorIntervalS(): number {
  return parseFloat(process.env.STUDIO_MONITOR_INTERVAL || "5");
}

export function heartbeatStaleS(): number {
  return parseFloat(process.env.STUDIO_HEARTBEAT_STALE_SEC || "45");
}

/** Postgres URL for Prisma (strips SQLAlchemy's +psycopg driver suffix). */
export function databaseUrl(): string {
  const raw =
    process.env.DATABASE_URL ||
    process.env.STUDIO_DATABASE_URL ||
    "postgresql://studio:studio@localhost:5432/dharwin_studio";
  return raw.replace(/^postgresql\+psycopg:\/\//, "postgresql://");
}

function configuredBucket(): string {
  return (process.env.STUDIO_S3_BUCKET || process.env.AWS_S3_BUCKET_NAME || "").trim();
}

export function s3MockEnabled(): boolean {
  const raw = (process.env.STUDIO_S3_MOCK || "").trim().toLowerCase();
  if (raw) {
    return ["1", "true", "yes", "on"].includes(raw);
  }
  return !(
    configuredBucket() &&
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY
  );
}

export function s3Bucket(): string {
  return configuredBucket() || "dharwin-studio-dev";
}

// Accessors read process.env directly, so there is no cached state to clear.
// Kept as a no-op because tests import it to force a config re-read.
export function resetForTests(): void {}
