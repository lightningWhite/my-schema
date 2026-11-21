/**
 * "Sign in with GitHub" (docs/design.md §3.4). Standard OAuth web flow with
 * PKCE. The only step that needs a server — swapping the one-time code for a
 * token — goes through a tiny Worker we run (worker/), because GitHub needs a
 * client secret for it and doesn't accept that request from a browser.
 *
 * Configured at build time:
 *   VITE_GITHUB_CLIENT_ID  the OAuth App's client ID (public)
 *   VITE_AUTH_URL          the Worker's URL
 */
import type { GitHubAccount } from '../sync/github';

const CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID as string | undefined;
const AUTH_URL = import.meta.env.VITE_AUTH_URL as string | undefined;
const PENDING = 'schema.signin';

/** Whether one-click sign-in is set up in this build. */
export const signInAvailable = !!(CLIENT_ID && AUTH_URL);

function redirectUri(): string {
  return location.origin + location.pathname;
}

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Send the person to GitHub's own sign-in page. */
export async function startSignIn(): Promise<void> {
  if (!signInAvailable) throw new Error('Sign-in is not set up in this copy of the app.');
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const state = base64url(crypto.getRandomValues(new Uint8Array(16)));
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  sessionStorage.setItem(PENDING, JSON.stringify({ state, verifier }));
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', CLIENT_ID!);
  url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('scope', 'repo');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('allow_signup', 'true');
  location.assign(url.toString());
}

/**
 * If GitHub just sent the person back here, finish signing in. Returns the
 * connected account, null if this isn't a sign-in return, or throws with a
 * plain-language message.
 */
export async function finishSignInIfReturning(): Promise<GitHubAccount | null> {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const state = params.get('state');
  const error = params.get('error');
  if (!code && !error) return null;

  // Clean the address bar either way.
  history.replaceState(null, '', redirectUri() + location.hash);
  const pending = JSON.parse(sessionStorage.getItem(PENDING) ?? 'null') as { state: string; verifier: string } | null;
  sessionStorage.removeItem(PENDING);

  if (error) throw new Error(error === 'access_denied' ? 'Sign-in was cancelled.' : 'GitHub sign-in did not finish. Please try again.');
  if (!pending || pending.state !== state) throw new Error('That sign-in link is out of date. Please try again.');

  let token: string;
  try {
    const res = await fetch(AUTH_URL!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, code_verifier: pending.verifier, redirect_uri: redirectUri() }),
    });
    const body = (await res.json()) as { access_token?: string; error?: string };
    if (!body.access_token) throw new Error(body.error ?? 'no token');
    token = body.access_token;
  } catch {
    throw new Error("Couldn't finish signing in with GitHub. Please try again.");
  }
  const { GitHubStore } = await import('../sync/github');
  return GitHubStore.connect(token);
}

/** The advanced path: connect with a personal access token. */
export async function connectWithToken(token: string): Promise<GitHubAccount> {
  const { GitHubStore } = await import('../sync/github');
  return GitHubStore.connect(token.trim());
}
