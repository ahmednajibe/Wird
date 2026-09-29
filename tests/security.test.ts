/**
 * localOnly middleware: loopback-only Host check, Origin check on mutations,
 * and JSON-only content-type for bodies.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { makeTestApp } from './helpers.js';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let ctx: ReturnType<typeof makeTestApp> | null = null;
afterEach(() => {
  ctx?.cleanup();
  ctx = null;
});

const req = (path: string, init?: RequestInit) => ctx!.app.request(path, init);

describe('localOnly', () => {
  it('rejects a non-local Host', async () => {
    ctx = makeTestApp('2026-09-27');
    const res = await req('/api/health', { headers: { host: 'evil.com' } });
    expect(res.status).toBe(403);
    const j = (await res.json()) as Json;
    expect(j.error).toBe('Forbidden: this server only accepts local requests');
  });

  it('accepts loopback hosts on any port', async () => {
    ctx = makeTestApp('2026-09-27');
    for (const host of ['localhost:5173', '127.0.0.1:4545', '127.0.0.1:54321', '[::1]:4545']) {
      const res = await req('/api/health', { headers: { host } });
      expect(res.status, host).toBe(200);
    }
  });

  it('rejects mutations from a foreign Origin', async () => {
    ctx = makeTestApp('2026-09-27');
    const res = await req('/api/tasks/score-preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.com' },
      body: JSON.stringify({ track: 'ai', title: 'x', minutes: 30, type: 'learn' }),
    });
    expect(res.status).toBe(403);
    const res2 = await req('/api/tasks/score-preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'null' },
      body: JSON.stringify({ track: 'ai', title: 'x', minutes: 30, type: 'learn' }),
    });
    expect(res2.status).toBe(403);
  });

  it('accepts mutations from a loopback Origin', async () => {
    ctx = makeTestApp('2026-09-27');
    const res = await req('/api/tasks/score-preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
      body: JSON.stringify({ track: 'ai', title: 'x', minutes: 30, type: 'learn' }),
    });
    expect(res.status).toBe(200);
  });

  it('rejects a non-JSON body on mutations', async () => {
    ctx = makeTestApp('2026-09-27');
    const res = await req('/api/tasks/score-preview', {
      method: 'POST',
      headers: { 'content-type': 'text/plain', 'content-length': '5' },
      body: 'hello',
    });
    expect(res.status).toBe(415);
    const j = (await res.json()) as Json;
    expect(j.error).toBe('Request body must be JSON (Content-Type: application/json)');
  });

  it('allows body-less POSTs with no content-type', async () => {
    ctx = makeTestApp('2026-09-27');
    const dash = (await (await req('/api/dashboard')).json()) as Json;
    const task = (dash.tasks as Json[]).find((t) => t.track !== 'quran' && t.status === 'pending');
    const res = await req(`/api/tasks/${task!.id}/skip`, { method: 'POST' });
    expect(res.status).toBe(200);
  });

  it('does not apply the Origin check to GET', async () => {
    ctx = makeTestApp('2026-09-27');
    const res = await req('/api/health', { headers: { origin: 'https://evil.com' } });
    expect(res.status).toBe(200);
  });
});
