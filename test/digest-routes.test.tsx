import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

const line = (at: string, job: string, status: string, error?: string) =>
  JSON.stringify({ at: at, job: job, status: status, owner: 'ops', error: error ?? null });

let dir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  const normal = [
    line('2026-10-01T01:00:00+01:00', 'zeta', 'ok'),
    line('2026-10-01T01:10:00+01:00', 'flaky', 'retry'),
    line('2026-10-01T01:11:00+01:00', 'flaky', 'retry'),
    line('2026-10-01T01:12:00+01:00', 'flaky', 'retry'),
    line('2026-10-01T01:13:00+01:00', 'flaky', 'ok'),
    line('2026-10-01T01:20:00+01:00', 'broken', 'fail', 'boom'),
    line('2026-10-01T01:30:00+01:00', 'alpha', 'ok'),
  ];
  writeFileSync(join(dir, '2026-10-01.jsonl'), normal.join('\n') + '\n');
  writeFileSync(join(dir, '2026-10-02.jsonl'), '');
  writeFileSync(
    join(dir, '2026-10-03.jsonl'),
    [line('2026-10-03T01:00:00+01:00', 'alpha', 'ok'), '{not json'].join('\n') + '\n',
  );
  app = createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: dir });
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const page = async (night: string) => {
  const res = await app.request(`/digest/${night}`);
  return { status: res.status, html: await res.text() };
};
const api = async (night: string) => {
  const res = await app.request(`/api/digest/${night}`);
  return { status: res.status, body: (await res.json()) as Night & { error?: string } };
};

describe('GET /digest/:night', () => {
  it('200 with jobs and warn marks', async () => {
    const { status, html } = await page('2026-10-01');
    expect(status).toBe(200);
    for (const job of ['alpha', 'broken', 'flaky', 'zeta']) expect(html).toContain(job);
    expect(html).toContain('⚠ flaky');
    expect(html).toContain('⚠ broken');
    expect(html).not.toContain('⚠ alpha');
    expect(html).not.toContain('⚠ zeta');
  });

  it('404 for a night with no file', async () => {
    expect((await page('2026-10-09')).status).toBe(404);
  });

  it('404 for a malformed night', async () => {
    expect((await page('..%2Fx')).status).toBe(404);
  });

  it('empty night says nothing ran', async () => {
    const { status, html } = await page('2026-10-02');
    expect(status).toBe(200);
    expect(html).toContain('nothing ran');
  });

  it('bad line shows the could-not-be-read note', async () => {
    const { status, html } = await page('2026-10-03');
    expect(status).toBe(200);
    expect(html).toContain('1 line could not be read');
  });
});

describe('GET /api/digest/:night', () => {
  it('200 with jobs', async () => {
    const { status, body } = await api('2026-10-01');
    expect(status).toBe(200);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha', 'broken', 'flaky', 'zeta']);
    expect(body.rows.find((r) => r.job === 'flaky')?.retries).toBe(3);
    expect(body.rows.find((r) => r.job === 'broken')?.lastStatus).toBe('fail');
  });

  it('404 for a night with no file', async () => {
    expect((await api('2026-10-09')).status).toBe(404);
  });

  it('404 for a malformed night', async () => {
    expect((await api('..%2Fx')).status).toBe(404);
  });

  it('empty night has no rows', async () => {
    const { status, body } = await api('2026-10-02');
    expect(status).toBe(200);
    expect(body.rows).toEqual([]);
  });

  it('bad line is counted', async () => {
    const { status, body } = await api('2026-10-03');
    expect(status).toBe(200);
    expect(body.badLines).toBe(1);
  });
});

describe('page and JSON agree', () => {
  it('list the same jobs in the same order', async () => {
    const { html } = await page('2026-10-01');
    const { body } = await api('2026-10-01');
    const jobs = body.rows.map((r) => r.job);
    const inPage = [...html.matchAll(/<tr[^>]*><td>(?:⚠ )?([^<]+)<\/td>/g)].map((m) => m[1]);
    expect(inPage).toEqual(jobs);
  });
});
