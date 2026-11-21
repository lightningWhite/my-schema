import { afterEach, describe, expect, it, vi } from 'vitest';
// The sign-in Worker is plain JS deployed to Cloudflare; test it here with a fake GitHub.
// @ts-expect-error -- untyped JS module
import worker from '../../worker/index.js';

const env = { GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'secret', ALLOWED_ORIGIN: 'https://app.example' };
const post = (body: unknown, origin = 'https://app.example') =>
  new Request('https://signin.example/', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const good = { code: 'c', code_verifier: 'v', redirect_uri: 'https://app.example/my-schema/' };

afterEach(() => vi.unstubAllGlobals());

describe('sign-in Worker', () => {
  it('swaps a code for a token, sending the secret only to GitHub', async () => {
    const gh = vi.fn(async () => new Response(JSON.stringify({ access_token: 'gho_123' })));
    vi.stubGlobal('fetch', gh);
    const res = await worker.fetch(post(good), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ access_token: 'gho_123' });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example');
    const [url, init] = gh.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://github.com/login/oauth/access_token');
    expect(JSON.parse(String(init.body))).toMatchObject({ client_id: 'id', client_secret: 'secret', code: 'c', code_verifier: 'v' });
  });

  it('works without PKCE, as after installing the app', async () => {
    const gh = vi.fn(async () => new Response(JSON.stringify({ access_token: 'ghu_9' })));
    vi.stubGlobal('fetch', gh);
    const { code_verifier: _v, ...noPkce } = good;
    const res = await worker.fetch(post(noPkce), env);
    expect(await res.json()).toEqual({ access_token: 'ghu_9' });
    const [, init] = gh.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).not.toHaveProperty('code_verifier');
  });

  it('refuses other websites', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const res = await worker.fetch(post(good, 'https://evil.example'), env);
    expect(res.status).toBe(403);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('refuses to send people back anywhere but the app', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const res = await worker.fetch(post({ ...good, redirect_uri: 'https://evil.example/' }), env);
    expect(res.status).toBe(400);
  });

  it('passes on a GitHub refusal without a token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'bad_verification_code' }))));
    const res = await worker.fetch(post(good), env);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad_verification_code' });
  });

  it('answers the browser preflight for the app only', async () => {
    const pre = (origin: string) => new Request('https://signin.example/', { method: 'OPTIONS', headers: { Origin: origin } });
    expect((await worker.fetch(pre('https://app.example'), env)).status).toBe(204);
    expect((await worker.fetch(pre('https://evil.example'), env)).status).toBe(403);
  });
});
