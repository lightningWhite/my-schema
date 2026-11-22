/**
 * GitHub as a backup store: a private repo (`schema-private`) in the person's
 * own account. Reads with one tree listing plus a blob per changed file;
 * writes one commit per sync with the Git Data API, moving the branch only
 * if nobody else moved it first.
 */
import { AuthError, BackupError, StaleError, type BackupStore, type Listing } from './store';

export const REPO_NAME = 'schema-private';
const REF_RETRIES = 3;
const REF_RETRY_DELAY = 700;
/** Tries before trusting a clear "not installed" / "not chosen" answer (~30 s). */
const CLEAR_ANSWER_ATTEMPTS = 5;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const REPO_DESCRIPTION = 'My Schema backup: tidbits I keep, revise and come back to.';
const README = `# My Schema backup

This private repository is where [Schema](https://lightningwhite.github.io/my-schema/) keeps
your tidbits: one Markdown file per tidbit in \`tidbits/\`. Only you can see it.
The app keeps it up to date; you don't need to do anything here.
`;

/** Why Schema can't reach the backup yet, as best GitHub can tell us. */
export type SetupProblem =
  /** The Schema app isn't installed on the person's account. */
  | { kind: 'not-installed' }
  /** Installed, but schema-private wasn't one of the repositories chosen. */
  | { kind: 'repo-not-chosen'; settingsUrl: string }
  /** Installed with schema-private chosen; GitHub just hasn't caught up yet. */
  | { kind: 'not-visible-yet' }
  /** Can't tell (e.g. a personal access token). */
  | { kind: 'unknown' };

const SETUP_MESSAGES: Record<SetupProblem['kind'], string> = {
  'not-installed': "Schema isn't connected to your GitHub yet. Tap “Connect Schema to my backup” (step 2).",
  'repo-not-chosen':
    "Schema is connected, but wasn't given your schema-private backup. Tap “Choose schema-private on GitHub”, tick schema-private, save, then come back and tap “Check again”.",
  'not-visible-yet': 'GitHub is still finishing setting things up. This usually takes under a minute — tap “Check again” shortly.',
  unknown:
    "Schema can't see your schema-private backup yet. Make sure both steps are done; if you just did them, wait a minute and tap “Check again”.",
};

/** The person (or GitHub) still has a step to finish before Schema can reach the backup. */
export class SetupNeededError extends Error {
  constructor(public readonly problem: SetupProblem = { kind: 'unknown' }) {
    super(SETUP_MESSAGES[problem.kind]);
  }
}

export interface ConnectOptions {
  fetch?: Fetch;
  /**
   * Keep trying for a while even if GitHub says the app isn't installed or the
   * repo isn't chosen. Right after installing, GitHub can take a minute to
   * catch up, and its answers in the meantime can be wrong.
   */
  patient?: boolean;
  /** How many tries, and how long between them (defaults: ~90 seconds in all). */
  attempts?: number;
  delayMs?: number;
  /** Called when the first try fails and we start waiting for GitHub. */
  onWaiting?: () => void;
}
const API = 'https://api.github.com';

type Fetch = typeof fetch;

export interface GitHubAccount {
  token: string;
  login: string;
  owner: string;
  repo: string;
  branch: string;
}

export class GitHubStore implements BackupStore {
  readonly label = 'GitHub';
  readonly webUrl: string;
  private treeByCommit = new Map<string, string>();

  constructor(
    private readonly account: GitHubAccount,
    private readonly fetchImpl: Fetch = fetch.bind(globalThis),
    private readonly retryDelay = REF_RETRY_DELAY,
  ) {
    this.webUrl = `https://github.com/${account.owner}/${account.repo}`;
  }

  /**
   * Connect to the person's private backup repo (`schema-private`).
   *
   * With the Schema GitHub App, the person creates the repo on github.com and
   * grants the app access to just that repo; the app can't create it. With a
   * personal access token that allows it, a missing repo is created here.
   * Throws SetupNeededError, in plain words, when the repo is missing or not
   * shared with Schema.
   */
  static async connect(token: string, fetchImpl: Fetch = fetch.bind(globalThis)): Promise<GitHubAccount> {
    const api = (path: string, init?: CallInit) => call(fetchImpl, token, path, init);
    const user = (await api('/user')) as { login: string };
    type RepoJson = { default_branch: string; owner: { login: string }; name: string };
    let repo = (await api(`/repos/${user.login}/${REPO_NAME}`, { allow404: true })) as RepoJson | null;
    if (!repo) {
      try {
        repo = (await api('/user/repos', {
          method: 'POST',
          body: JSON.stringify({
            name: REPO_NAME,
            private: true,
            auto_init: true,
            description: REPO_DESCRIPTION,
          }),
        })) as RepoJson;
      } catch (e) {
        // GitHub App sign-ins can't create repos, and can't see repos they
        // weren't given. Either way the person has a step to do on GitHub.
        if (e instanceof HttpError && [403, 404, 422].includes(e.status)) throw new SetupNeededError();
        throw e;
      }
    }
    const owner = repo.owner.login;
    const branch = repo.default_branch;
    // A repo created on github.com without a README is empty, and GitHub's Git
    // Data API refuses to work on an empty repo. Give it a first file.
    const ref = await api(`/repos/${owner}/${repo.name}/git/ref/heads/${branch}`, { allow404: true, allow409: true });
    if (!ref) {
      await api(`/repos/${owner}/${repo.name}/contents/README.md`, {
        method: 'PUT',
        body: JSON.stringify({ message: 'Start my Schema backup', content: encodeBase64Utf8(README), branch }),
      });
    }
    return { token, login: user.login, owner, repo: repo.name, branch };
  }

  /**
   * Connect, waiting for GitHub to catch up after the app was just installed.
   * Gives up with a SetupNeededError saying what's actually missing.
   */
  static async connectWhenReady(token: string, opts: ConnectOptions = {}): Promise<GitHubAccount> {
    const fetchImpl = opts.fetch ?? fetch.bind(globalThis);
    const attempts = opts.attempts ?? 12;
    const delayMs = opts.delayMs ?? 7500;
    let problem: SetupProblem = { kind: 'unknown' };
    for (let i = 0; i < attempts; i++) {
      try {
        return await GitHubStore.connect(token, fetchImpl);
      } catch (e) {
        if (!(e instanceof SetupNeededError)) throw e;
      }
      problem = await GitHubStore.diagnose(token, fetchImpl);
      // Only waiting can fix "not visible yet". Right after installing, any
      // answer may be stale, so wait then too — but less long when GitHub's
      // answer is a clear "not installed" or "not chosen", so people aren't
      // left watching a spinner when they have something to fix.
      const clearAnswer = problem.kind === 'not-installed' || problem.kind === 'repo-not-chosen';
      const limit = clearAnswer ? Math.min(attempts, CLEAR_ANSWER_ATTEMPTS) : attempts;
      const worthWaiting = opts.patient || problem.kind === 'not-visible-yet';
      if (!worthWaiting || i >= limit - 1) break;
      if (i === 0) opts.onWaiting?.();
      await sleep(delayMs);
    }
    throw new SetupNeededError(problem);
  }

  /** Ask GitHub why the backup isn't reachable: not installed, repo not chosen, or not yet visible. */
  static async diagnose(token: string, fetchImpl: Fetch = fetch.bind(globalThis)): Promise<SetupProblem> {
    const api = (path: string) => call(fetchImpl, token, path);
    try {
      const user = (await api('/user')) as { login: string };
      const { installations } = (await api('/user/installations')) as {
        installations: Array<{ id: number; account: { login: string } }>;
      };
      const mine = installations.find((i) => i.account.login.toLowerCase() === user.login.toLowerCase());
      if (!mine) return { kind: 'not-installed' };
      const { repositories } = (await api(`/user/installations/${mine.id}/repositories?per_page=100`)) as {
        repositories: Array<{ name: string }>;
      };
      if (repositories.some((r) => r.name === REPO_NAME)) return { kind: 'not-visible-yet' };
      return { kind: 'repo-not-chosen', settingsUrl: `https://github.com/settings/installations/${mine.id}` };
    } catch {
      return { kind: 'unknown' }; // e.g. personal access tokens can't list installations
    }
  }

  private api(path: string, init?: RequestInit) {
    return call(this.fetchImpl, this.account.token, `/repos/${this.account.owner}/${this.account.repo}${path}`, init);
  }

  async list(): Promise<{ head: string; files: Listing }> {
    const ref = (await this.api(`/git/ref/heads/${this.account.branch}`)) as { object: { sha: string } };
    const head = ref.object.sha;
    const commit = (await this.api(`/git/commits/${head}`)) as { tree: { sha: string } };
    this.treeByCommit.set(head, commit.tree.sha);
    return { head, files: await this.listTree(commit.tree.sha) };
  }

  private async listTree(treeSha: string): Promise<Listing> {
    const tree = (await this.api(`/git/trees/${treeSha}?recursive=1`)) as {
      tree: Array<{ path: string; type: string; sha: string }>;
      truncated: boolean;
    };
    if (tree.truncated) throw new BackupError('The backup is too large to list in one go.');
    return new Map(tree.tree.filter((e) => e.type === 'blob').map((e) => [e.path, e.sha]));
  }

  async read(_path: string, id: string): Promise<string> {
    const blob = (await this.api(`/git/blobs/${id}`)) as { content: string; encoding: string };
    if (blob.encoding !== 'base64') throw new BackupError(`Unexpected encoding: ${blob.encoding}`);
    return decodeBase64Utf8(blob.content);
  }

  async write(head: string, writes: Map<string, string>, deletes: string[], message: string) {
    let baseTree = this.treeByCommit.get(head);
    if (!baseTree) baseTree = ((await this.api(`/git/commits/${head}`)) as { tree: { sha: string } }).tree.sha;
    const tree = (await this.api('/git/trees', {
      method: 'POST',
      body: JSON.stringify({
        base_tree: baseTree,
        tree: [
          ...[...writes].map(([path, content]) => ({ path, mode: '100644', type: 'blob', content })),
          ...deletes.map((path) => ({ path, mode: '100644', type: 'blob', sha: null })),
        ],
      }),
    })) as { sha: string };
    const commit = (await this.api('/git/commits', {
      method: 'POST',
      body: JSON.stringify({ message, tree: tree.sha, parents: [head] }),
    })) as { sha: string };
    // Move the branch to the new commit, but only as a fast-forward. GitHub
    // answers 422 both when another device moved the branch first (stale) and
    // for other reasons — including briefly right after a commit is created —
    // so check which before deciding.
    for (let attempt = 0; ; attempt++) {
      try {
        await this.api(`/git/refs/heads/${this.account.branch}`, {
          method: 'PATCH',
          body: JSON.stringify({ sha: commit.sha, force: false }),
        });
        break;
      } catch (e) {
        if (!(e instanceof HttpError && e.status === 422)) throw e;
        const now = (await this.api(`/git/ref/heads/${this.account.branch}`)) as { object: { sha: string } };
        if (now.object.sha !== head) throw new StaleError();
        if (attempt >= REF_RETRIES) throw new BackupError(`GitHub didn't accept the update (${e.message}). Will try again shortly.`);
        await sleep(this.retryDelay * (attempt + 1));
      }
    }
    this.treeByCommit.set(commit.sha, tree.sha);
    return { head: commit.sha, files: await this.listTree(tree.sha) };
  }
}

class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type CallInit = RequestInit & { allow404?: boolean; allow409?: boolean };

async function call(fetchImpl: Fetch, token: string, path: string, init: CallInit = {}): Promise<unknown> {
  const { allow404, allow409, ...rest } = init;
  let res: Response;
  try {
    res = await fetchImpl(API + path, {
      ...rest,
      // GitHub sends `Cache-Control: max-age=60`, so browsers may answer from
      // a copy up to a minute old. A stale answer makes a just-saved tidbit
      // look deleted elsewhere. Always ask GitHub.
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch {
    throw new BackupError("Couldn't reach GitHub. Check your connection.");
  }
  if (res.status === 404 && allow404) return null;
  if (res.status === 409 && allow409) return null; // "Git Repository is empty"
  if (res.status === 401) throw new AuthError('GitHub no longer accepts this sign-in. Please sign in again.');
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    if (res.status === 403 && /rate limit/i.test(body.message ?? '')) {
      throw new BackupError('GitHub asked us to slow down. Syncing will try again in a little while.');
    }
    if (res.status === 403 || res.status === 404) {
      throw new HttpError(res.status, "This sign-in can't reach your backup. Try signing in again.");
    }
    throw new HttpError(res.status, body.message ?? `GitHub error ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function encodeBase64Utf8(text: string): string {
  let bin = '';
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
  return btoa(bin);
}

function decodeBase64Utf8(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
