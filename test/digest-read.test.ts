import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight, statusCounts } from '../src/digest/read.js';

const tmp = mkdtempSync(join(tmpdir(), 'rig-digest-read-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('readNight', () => {
  const night = readNight('runs', '2026-10-28');

  it('reads 5 jobs sorted by job and counts 1 bad line', () => {
    expect(night).not.toBeNull();
    expect(night?.night).toBe('2026-10-28');
    expect(night?.badLines).toBe(1);
    expect(night?.rows.map((row) => row.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('counts retries and keeps the last status and times as logged', () => {
    const row = night?.rows.find((r) => r.job === 'fixtures/refresh');
    expect(row?.runs).toBe(4);
    expect(row?.retries).toBe(3);
    expect(row?.lastStatus).toBe('ok');
    expect(row?.firstAt).toBe('2026-10-29T01:30:00+01:00');
    expect(row?.lastAt).toBe('2026-10-29T01:37:00+01:00');
  });

  it('keeps the failure and its error', () => {
    const row = night?.rows.find((r) => r.job === 'notes/backup');
    expect(row?.lastStatus).toBe('fail');
    expect(row?.lastError).toBe('quota exceeded');
  });

  it('keeps a row whose owner is null', () => {
    const row = night?.rows.find((r) => r.job === 'digest/render');
    expect(row).toBeDefined();
    expect(row?.owner).toBeNull();
  });

  it('returns null for a night with no file', () => {
    expect(readNight('runs', '1999-01-01')).toBeNull();
  });

  it('reads an empty file as a night with no rows', () => {
    writeFileSync(join(tmp, '2026-01-01.jsonl'), '');
    expect(readNight(tmp, '2026-01-01')).toEqual({ night: '2026-01-01', rows: [], badLines: 0 });
  });

  it('counts invalid lines as bad, and blank lines not at all', () => {
    const lines = [
      '{"at":"2026-01-02T01:00:00+01:00","job":"a","status":"ok","owner":"x"}',
      '{"at":"2026-01-02T01:00:00+01:00","job":"a","status":"maybe","owner":"x"}',
      '{"at":"2026-01-02T01:00:00+01:00","status":"ok","owner":"x"}',
      '[1,2]',
      '',
    ];
    writeFileSync(join(tmp, '2026-01-02.jsonl'), `${lines.join('\n')}\n`);
    const result = readNight(tmp, '2026-01-02');
    expect(result?.rows).toHaveLength(1);
    expect(result?.badLines).toBe(3);
  });
});

describe('statusCounts', () => {
  it('counts parsed lines by status for 2026-10-28', () => {
    expect(statusCounts('runs', '2026-10-28')).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('returns null for a night with no file', () => {
    expect(statusCounts('runs', '1999-01-01')).toBeNull();
  });
});
