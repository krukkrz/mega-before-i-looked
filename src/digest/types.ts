// Types for the morning digest (plan.md § 1). The reader itself is issue #2.

// One line of runs/<night>.jsonl, as the log writes it.
export type RunStatus = 'ok' | 'retry' | 'fail';

// One row per job for a night.
export type DigestRow = {
  job: string;
  // `null` in the log is kept; views show it as `—`.
  owner: string | null;
  // Every parsed line for this job, whatever its status.
  runs: number;
  // Lines for this job with status `retry`.
  retries: number;
  // Status of the job's last line (by time).
  lastStatus: RunStatus;
  // `error` of the job's last line that carried one, or `null` if none did.
  lastError: string | null;
  // ISO 8601 with the offset exactly as in the log (e.g. `2026-10-28T23:00:02+01:00`).
  // Never converted to UTC.
  firstAt: string;
  lastAt: string;
};

// A night that has a file on disk.
export type Night = {
  night: string;
  // Sorted by job.
  rows: DigestRow[];
  // Lines that didn't parse (bad JSON or missing/invalid fields). Counted, never thrown.
  badLines: number;
};

// `null` means there is no `runs/<night>.jsonl`: the page answers 404.
// An empty file is a `Night` with no rows ("nothing ran"), not `null`.
export type ReadNight = (runsDir: string, night: string) => Night | null;
