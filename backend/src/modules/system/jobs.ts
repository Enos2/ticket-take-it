// ==========================================
// FILE: backend/src/modules/system/jobs.ts
// PURPOSE: Remembers when each background job last ran, so the admin can see if one is stuck.
// ==========================================
interface JobState {
  name: string;
  intervalMs: number;
  registeredAt: Date;
  running: boolean;
  lastStartedAt: Date | null;
  lastFinishedAt: Date | null;
  lastDurationMs: number | null;
  lastItems: number | null;
  lastError: string | null;
  runs: number;
  failures: number;
}

const jobs = new Map<string, JobState>();

export function registerJob(name: string, intervalMs: number): void {
  jobs.set(name, {
    name,
    intervalMs,
    registeredAt: new Date(),
    running: false,
    lastStartedAt: null,
    lastFinishedAt: null,
    lastDurationMs: null,
    lastItems: null,
    lastError: null,
    runs: 0,
    failures: 0,
  });
}

export function jobStarted(name: string): void {
  const job = jobs.get(name);
  if (!job) return;
  job.running = true;
  job.lastStartedAt = new Date();
}

export function jobFinished(name: string, items: number | null, error: string | null): void {
  const job = jobs.get(name);
  if (!job) return;
  job.running = false;
  job.lastFinishedAt = new Date();
  job.lastDurationMs = job.lastStartedAt ? job.lastFinishedAt.getTime() - job.lastStartedAt.getTime() : null;
  job.runs += 1;
  if (error) {
    job.failures += 1;
    job.lastError = error;
  } else {
    job.lastError = null;
    job.lastItems = items;
  }
}

// A job that has not finished a run for three times its interval looks stuck.
function isStale(job: JobState): boolean {
  const reference = job.lastFinishedAt ?? job.registeredAt;
  return Date.now() - reference.getTime() > job.intervalMs * 3 + 60_000;
}

export function getJobs() {
  return [...jobs.values()].map((job) => ({ ...job, stale: isStale(job) }));
}
// ==========================================
// END OF FILE: backend/src/modules/system/jobs.ts
// ==========================================