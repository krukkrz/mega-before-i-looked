// Run log reader (plan.md § 1, issue #2). Reads runs/<night>.jsonl; never writes to it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, ReadNight, RunStatus } from './types.js';

// One valid line of the log, after parsing at the edge.
type RunLine = {
  at: string;
  // Milliseconds since epoch, for ordering only. `at` is what we keep.
  atMs: number;
  job: string;
  status: RunStatus;
  owner: string | null;
  error: string | null;
};

// ISO 8601 date-time with an explicit offset (`Z` or `±hh:mm`).
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

const isStatus = (value: unknown): value is RunStatus =>
  value === 'ok' || value === 'retry' || value === 'fail';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Returns the parsed line, or `null` when the line is bad (bad JSON or missing/invalid fields).
const parseLine = (line: string): RunLine | null => {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const { at, job, status, owner, error } = value;
  if (typeof at !== 'string' || !ISO_WITH_OFFSET.test(at)) return null;
  const atMs = Date.parse(at);
  if (Number.isNaN(atMs)) return null;
  if (typeof job !== 'string' || job === '') return null;
  if (!isStatus(status)) return null;
  if (!('owner' in value) || (owner !== null && typeof owner !== 'string')) return null;
  if (error !== undefined && error !== null && typeof error !== 'string') return null;
  return {
    at: at,
    atMs: atMs,
    job: job,
    status: status,
    owner: owner,
    error: typeof error === 'string' ? error : null,
  };
};

type ParsedLog = { lines: RunLine[]; badLines: number };

// `null` when there is no file for the night.
const readLog = (runsDir: string, night: string): ParsedLog | null => {
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (err) {
    if (isRecord(err) && err.code === 'ENOENT') return null;
    throw err;
  }
  const lines: RunLine[] = [];
  let badLines = 0;
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (line === null) badLines += 1;
    else lines.push(line);
  }
  return { lines: lines, badLines: badLines };
};

const toRow = (job: string, lines: RunLine[]): DigestRow => {
  // Stable sort by time: lines with the same instant keep their file order.
  const byTime = [...lines].sort((a, b) => a.atMs - b.atMs);
  const first = byTime[0];
  const last = byTime[byTime.length - 1];
  const lastWithError = byTime.findLast((line) => line.error !== null);
  return {
    job: job,
    owner: last.owner,
    runs: byTime.length,
    retries: byTime.filter((line) => line.status === 'retry').length,
    lastStatus: last.status,
    lastError: lastWithError?.error ?? null,
    firstAt: first.at,
    lastAt: last.at,
  };
};

export const readNight: ReadNight = (runsDir, night) => {
  const log = readLog(runsDir, night);
  if (log === null) return null;
  const byJob = new Map<string, RunLine[]>();
  for (const line of log.lines) {
    const group = byJob.get(line.job);
    if (group) group.push(line);
    else byJob.set(line.job, [line]);
  }
  const rows = [...byJob.entries()]
    .map(([job, lines]) => toRow(job, lines))
    .sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  const result: Night = { night: night, rows: rows, badLines: log.badLines };
  return result;
};

export type StatusCounts = { ok: number; retry: number; fail: number };

// Parsed lines per status for a night; `null` when there is no file.
export const statusCounts = (runsDir: string, night: string): StatusCounts | null => {
  const log = readLog(runsDir, night);
  if (log === null) return null;
  const counts: StatusCounts = { ok: 0, retry: 0, fail: 0 };
  for (const line of log.lines) counts[line.status] += 1;
  return counts;
};
