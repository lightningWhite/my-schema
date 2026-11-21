/**
 * Signing in with the Schema GitHub App (docs/design.md §3.4).
 *
 * First time: (1) create the private backup on github.com from a pre-filled
 * page, (2) install the Schema app on just that repository — GitHub then
 * signs the person in and sends them back here. Another device: just sign in.
 *
 * The one step that needs a server — swapping GitHub's one-time code for a
 * token — goes through a tiny Worker (worker/), because GitHub needs the app's
 * client secret for it and doesn't accept that request from a browser.
 *
 * Configured at build time:
 *   VITE_GITHUB_CLIENT_ID  the GitHub App's client ID (public)
 *   VITE_GITHUB_APP_SLUG   the app's URL name, as in github.com/apps/<slug>
 *   VITE_AUTH_URL          the Worker's address
 */
import type { GitHubAccount } from '../sync/github';

const CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID as string | undefined;
const APP_SLUG = import.meta.env.VITE_GITHUB_APP_SLUG as string | undefined;
const AUTH_URL = import.meta.env.VITE_AUTH_URL as string | undefined;
const PENDING = 'schema.signin';
const PENDING_MAX_AGE = 30 * 60_000;

interface Pending {
  state: string;
  verifier: string | null;
  at: number;
}

/**
 * The "this sign-in is really yours" marker. Kept in localStorage, not
 * sessionStorage: on phones, GitHub often sends people back into a different
 * tab than the one they left from (e.g. from the home-screen app into the
 * browser), and sessionStorage is per tab.
 */
function savePending(state: string, verifier: string | null) {
  try {
    localStorage.setItem(PENDING, JSON.stringify({ state, verifier, at: Date.now() } satisfies Pending));
  } catch {
    sessionStorage.setItem(PENDING, JSON.stringify({ state, verifier, at: Date.now() } satisfies Pending));
  }
}

function takePending(): Pending | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PENDING);
    localStorage.removeItem(PENDING);
  } catch {
    // fall through to sessionStorage
  }
  raw ??= sessionStorage.getItem(PENDING);
  sessionStorage.removeItem(PENDING);
  const p = raw ? (JSON.parse(raw) as Pending) : null;
  return p && Date.now() - p.at < PENDING_MAX_AGE ? p : null;
}

/** Whether one-click sign-in is set up in this build. */
export const signInAvailable = !!(CLIENT_ID && AUTH_URL && APP_SLUG);

function redirectUri(): string {
  return location.origin + location.pathname;
}

function random(bytes: number): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Step 1: GitHub's new-repository page, filled in. Opens in a new tab. */
export function createBackupUrl(): string {
  const url = new URL('https://github.com/new');
  url.searchParams.set('name', 'schema-private');
  url.searchParams.set('visibility', 'private');
  url.searchParams.set('description', 'My Schema backup: tidbits I keep, revise and come back to.');
  return url.toString();
}

/**
 * Step 2: install the Schema app on the backup. GitHub asks which
 * repositories to share, then signs the person in and returns here.
 */
export function startInstall(): void {
  if (!signInAvailable) throw new Error('Sign-in is not set up in this copy of the app.');
  const state = random(16);
  savePending(state, null);
  location.assign(`https://github.com/apps/${APP_SLUG}/installations/new?state=${state}`);
}

/** Already set up (another device, or signed out): just sign in. */
export async function startSignIn(): Promise<void> {
  if (!signInAvailable) throw new Error('Sign-in is not set up in this copy of the app.');
  const verifier = random(32);
  const state = random(16);
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  savePending(state, verifier);
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', CLIENT_ID!);
  url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  location.assign(url.toString());
}

/**
 * If GitHub just sent the person back here (from installing or signing in),
 * finish connecting. Returns null if this isn't such a return. Throws with a
 * plain-language message if it didn't work out.
 */
export async function finishSignInIfReturning(): Promise<GitHubAccount | null> {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const state = params.get('state');
  const error = params.get('error');
  const fromInstall = params.has('setup_action') || params.has('installation_id');
  if (!code && !error && !fromInstall) return null;

  // Clean the address bar either way.
  history.replaceState(null, '', redirectUri() + location.hash);
  const pending = takePending();

  if (error) throw new Error(error === 'access_denied' ? 'Sign-in was cancelled.' : 'GitHub sign-in did not finish. Please try again.');
  if (!code) throw new Error('Almost there — tap "Sign in with GitHub" to finish connecting.');
  // The state check stops someone else's sign-in being slipped into this
  // device (which would send your tidbits to their backup).
  if (!pending || pending.state !== state) {
    throw new Error(fromInstall ? 'Almost there — tap "Sign in with GitHub" to finish connecting.' : 'That sign-in link is out of date. Please try again.');
  }

  let token: string;
  try {
    const res = await fetch(AUTH_URL!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, redirect_uri: redirectUri(), ...(pending.verifier ? { code_verifier: pending.verifier } : {}) }),
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
