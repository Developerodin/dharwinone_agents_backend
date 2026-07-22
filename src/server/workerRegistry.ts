/** In-process worker registry — cooperative cancel + liveness for monitor. */
const ACTIVE = new Map<string, { abort: AbortController; done: Promise<void> }>();

export function registerWorker(runId: string, abort: AbortController, done: Promise<void>): void {
  ACTIVE.set(runId, { abort, done });
  done.finally(() => ACTIVE.delete(runId));
}

export function abortWorker(runId: string): void {
  ACTIVE.get(runId)?.abort.abort();
}

export function isWorkerAlive(runId: string): boolean {
  return ACTIVE.has(runId);
}

export function resetWorkerRegistryForTests(): void {
  for (const { abort } of ACTIVE.values()) abort.abort();
  ACTIVE.clear();
}

export function activeWorkerCount(): number {
  return ACTIVE.size;
}
