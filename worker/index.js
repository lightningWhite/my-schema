/**
 * Schema sign-in helper (Cloudflare Worker).
 *
 * Does exactly one thing: swaps the one-time code GitHub gives the app after
 * signing in for an access token. GitHub requires the GitHub App's client
 * secret for that, and doesn't allow the request from a browser, so a static
 * app can't do it alone.
 *
 * It stores nothing, logs nothing, and never sees anyone's tidbits: the app
 * talks to GitHub directly for everything else. Only the app's own address
 * may call it.
 *
 * Settings (wrangler secrets / vars):
 *   GITHUB_CLIENT_ID      the GitHub App's client ID
 *   GITHUB_CLIENT_SECRET  the GitHub App's client secret (secret)
 *   ALLOWED_ORIGIN        e.g. https://lightningwhite.github.io
 */
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = origin === env.ALLOWED_ORIGIN;
    const cors = allowed
      ? {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
          Vary: 'Origin',
        }
      : {};
    const reply = (status, body) =>
      new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors } });

    if (request.method === 'OPTIONS') return new Response(null, { status: allowed ? 204 : 403, headers: cors });
    if (!allowed) return reply(403, { error: 'origin not allowed' });
    if (request.method !== 'POST') return reply(405, { error: 'POST only' });

    let input;
    try {
      input = await request.json();
    } catch {
      return reply(400, { error: 'bad request' });
    }
    const { code, code_verifier, redirect_uri } = input ?? {};
    // code_verifier (PKCE) is sent for plain sign-ins; installs don't use it.
    if (typeof code !== 'string' || typeof redirect_uri !== 'string' || (code_verifier !== undefined && typeof code_verifier !== 'string')) {
      return reply(400, { error: 'bad request' });
    }
    // The redirect must come back to the app itself, never somewhere else.
    if (new URL(redirect_uri).origin !== env.ALLOWED_ORIGIN) return reply(400, { error: 'bad redirect' });

    const gh = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'schema-signin' },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri,
        ...(code_verifier ? { code_verifier } : {}),
      }),
    });
    const body = await gh.json().catch(() => ({}));
    if (!body.access_token) return reply(400, { error: body.error_description ?? body.error ?? 'sign-in failed' });
    return reply(200, { access_token: body.access_token });
  },
};
