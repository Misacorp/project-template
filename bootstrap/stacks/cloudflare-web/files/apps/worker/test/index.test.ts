import { describe, expect, it } from 'vitest';
import worker from '../src/index.ts';

const env = {
  ENVIRONMENT: 'staging',
  VERSION: 'abc',
  BRANCH: 'feat',
  ASSETS: { fetch: () => Promise.resolve(new Response('asset')) },
} as unknown as Env;

type WorkerRequest = Parameters<typeof worker.fetch>[0];

const call = (path: string, init?: RequestInit) =>
  worker.fetch(new Request(`https://app.example.com${path}`, init) as WorkerRequest, env);

describe('worker', () => {
  it('reports the build at /api/config', async () => {
    const res = await call('/api/config');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ environment: 'staging', version: 'abc', branch: 'feat' });
  });

  it('answers unknown API routes and methods with 404', async () => {
    expect((await call('/api/nope')).status).toBe(404);
    expect((await call('/api/config', { method: 'POST' })).status).toBe(404);
  });

  it('leaves everything else to the assets', async () => {
    expect(await (await call('/')).text()).toBe('asset');
  });
});
