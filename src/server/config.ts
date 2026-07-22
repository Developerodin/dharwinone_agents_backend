// Port of backend/studio/config.py — lives inside backend/ so paths resolve locally.
import path from "node:path";

const DEFAULT_PORT = 8787;
const TRUTHY = new Set(["1", "true", "yes", "on"]);

let _backendDir: string | null = null;
let _dataDir: string | null = null;
let _port: number | null = null;
let _databaseUrl: string | null = null;
let _s3Mock: boolean | null = null;
let _s3Bucket: string | null = null;

export function backendDir(): string {
  if (_backendDir === null) {
    _backendDir = process.env.STUDIO_BACKEND_DIR || process.cwd();
  }
  return _backendDir;
}

export function dataDir(): string {
  if (_dataDir === null) {
    _dataDir = process.env.STUDIO_DATA || path.join(backendDir(), "studio", "data");
  }
  return _dataDir;
}

export function port(): number {
  if (_port === null) {
    _port = parseInt(process.env.STUDIO_PORT || String(DEFAULT_PORT), 10);
  }
  return _port;
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
  if (_databaseUrl === null) {
    const raw =
      process.env.DATABASE_URL ||
      process.env.STUDIO_DATABASE_URL ||
      "postgresql://studio:studio@localhost:5432/dharwin_studio";
    _databaseUrl = raw.replace(/^postgresql\+psycopg:\/\//, "postgresql://");
  }
  return _databaseUrl;
}

function configuredBucket(): string {
  return (process.env.STUDIO_S3_BUCKET || process.env.AWS_S3_BUCKET_NAME || "").trim();
}

export function s3MockEnabled(): boolean {
  if (_s3Mock === null) {
    const raw = (process.env.STUDIO_S3_MOCK || "").trim().toLowerCase();
    if (raw) {
      _s3Mock = TRUTHY.has(raw);
    } else {
      _s3Mock = !(
        configuredBucket() &&
        process.env.AWS_ACCESS_KEY_ID &&
        process.env.AWS_SECRET_ACCESS_KEY
      );
    }
  }
  return _s3Mock;
}

export function s3Bucket(): string {
  if (_s3Bucket === null) {
    _s3Bucket = configuredBucket() || "dharwin-studio-dev";
  }
  return _s3Bucket;
}

export function resetForTests(): void {
  _backendDir = null;
  _dataDir = null;
  _port = null;
  _databaseUrl = null;
  _s3Mock = null;
  _s3Bucket = null;
}
