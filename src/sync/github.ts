/**
 * GitHub as a backup store: a private repo (`schema-private`) in the person's
 * own account. Reads with one tree listing plus a blob per changed file;
 * writes one commit per sync with the Git Data API, moving the branch only
 * if nobody else moved it first.
 */
import { AuthError, BackupError, StaleError, type BackupStore, type Listing } from './store';

export const REPO_NAME = 'schema-private';
export const REPO_DESCRIPTION = 'My Schema backup: tidbits I keep, revise and come back to.';
const README = `# My Schema backup

This private repository is where [Schema](https://lightningwhite.github.io/my-schema/) keeps
your tidbits: one Markdown file per tidbit in \`tidbits/\`. Only you can see it.
The app keeps it up to date; you don't need to do anything here.
`;

/** The person still has a step to do on GitHub: create the backup, or share it with Schema. */
export class SetupNeededError extends Error {
  constructor() {
    super(
      "Schema can't see your schema-private backup yet. Make sure you've created it on GitHub (step 1), and picked it when connecting Schema (step 2).",
    );
  }
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
    try {
      await this.api(`/git/refs/heads/${this.account.branch}`, {
        method: 'PATCH',
        body: JSON.stringify({ sha: commit.sha, force: false }),
      });
    } catch (e) {
      // 422 "Update is not a fast forward": another device synced first.
      if (e instanceof HttpError && e.status === 422) throw new StaleError();
      throw e;
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
