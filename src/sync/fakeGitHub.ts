/**
 * A tiny in-memory GitHub for tests: just the REST endpoints the GitHub
 * store uses. Not imported by app code.
 */
interface Repo {
  owner: string;
  name: string;
  branch: string;
  ref: string;
  commits: Map<string, { tree: string; parents: string[]; message: string }>;
  trees: Map<string, Map<string, string>>; // tree sha → path → blob sha
}

export class FakeGitHub {
  readonly repos = new Map<string, Repo>();
  readonly blobs = new Map<string, string>(); // sha → text (content-addressed)
  private n = 0;
  /**
   * Simulates GitHub catching up after an install: the next N repo lookups by
   * GitHub App sign-ins answer 404 even for granted repos.
   */
  propagationLookups = 0;
  /** The next N branch updates fail with a 422 that isn't about staleness. */
  refUpdateFailures = 0;
  /** Runs just before a branch update is applied (simulate another device). */
  beforeRefUpdate?: () => Promise<void>;
  requests: string[] = [];

  /**
   * @param tokens token → login
   * @param appGrants GitHub App sign-ins: token → the repo names the app was
   *   given. These tokens can't create repos or see any other repo.
   */
  constructor(
    private readonly tokens: Record<string, string>,
    private readonly appGrants: Record<string, string[]> = {},
  ) {}

  /** A repo created on github.com without a README: no commits, no branch yet. */
  createEmptyRepo(owner: string, name: string) {
    this.repos.set(`${owner}/${name}`, { owner, name, branch: 'main', ref: '', commits: new Map(), trees: new Map() });
  }

  private id(prefix: string) {
    return `${prefix}${(++this.n).toString(16).padStart(8, '0')}`;
  }

  private blob(text: string): string {
    for (const [sha, t] of this.blobs) if (t === text) return sha;
    const sha = this.id('b');
    this.blobs.set(sha, text);
    return sha;
  }

  /** Files on the branch right now. */
  files(owner: string, name: string): Map<string, string> {
    const r = this.repos.get(`${owner}/${name}`)!;
    const tree = this.trees(r).get(r.commits.get(r.ref)!.tree)!;
    return new Map([...tree].map(([p, b]) => [p, this.blobs.get(b)!]));
  }

  private trees(r: Repo) {
    return r.trees;
  }

  /** Commit files directly, as another app or the GitHub website would. */
  commitDirect(owner: string, name: string, changes: Record<string, string | null>) {
    const r = this.repos.get(`${owner}/${name}`)!;
    const tree = new Map(r.trees.get(r.commits.get(r.ref)!.tree)!);
    for (const [p, t] of Object.entries(changes)) {
      if (t === null) tree.delete(p);
      else tree.set(p, this.blob(t));
    }
    const treeSha = this.id('t');
    r.trees.set(treeSha, tree);
    const c = this.id('c');
    r.commits.set(c, { tree: treeSha, parents: [r.ref], message: 'direct' });
    r.ref = c;
  }

  fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(String(input));
    const method = (init.method ?? 'GET').toUpperCase();
    this.requests.push(`${method} ${url.pathname}`);
    const auth = new Headers(init.headers).get('Authorization')?.replace(/^Bearer /, '');
    const login = auth ? this.tokens[auth] : undefined;
    if (!login) return json(401, { message: 'Bad credentials' });
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    const p = url.pathname;

    if (p === '/user' && method === 'GET') return json(200, { login });
    const grants = auth ? this.appGrants[auth] : undefined;
    if (p === '/user/repos' && method === 'POST') {
      if (grants) return json(403, { message: 'Resource not accessible by integration' });
      const name = body.name as string;
      if (this.repos.has(`${login}/${name}`)) return json(422, { message: 'name already exists on this account' });
      const readme = this.blob('# My Schema\n');
      const tree = this.id('t');
      const c = this.id('c');
      const repo: Repo = {
        owner: login,
        name,
        branch: 'main',
        ref: c,
        commits: new Map([[c, { tree, parents: [], message: 'Initial commit' }]]),
        trees: new Map([[tree, new Map([['README.md', readme]])]]),
      };
      this.repos.set(`${login}/${name}`, repo);
      return json(201, repoJson(repo));
    }

    if (p === '/user/installations' && method === 'GET') {
      if (!grants) return json(403, { message: 'Must authenticate with a GitHub App user token' });
      return json(200, { total_count: grants.length ? 1 : 0, installations: grants.length ? [{ id: 7, account: { login } }] : [] });
    }
    if (p === '/user/installations/7/repositories' && method === 'GET') {
      if (!grants?.length) return json(404, { message: 'Not Found' });
      return json(200, { total_count: grants.length, repositories: grants.map((name) => ({ name, owner: { login } })) });
    }

    const m = /^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/.exec(p);
    if (!m) return json(404, { message: 'Not Found' });
    const repo = this.repos.get(`${m[1]}/${m[2]}`);
    if (!repo || repo.owner !== login) return json(404, { message: 'Not Found' });
    if (grants && !grants.includes(repo.name)) return json(404, { message: 'Not Found' });
    if (grants && !m[3] && this.propagationLookups > 0) {
      this.propagationLookups--;
      return json(404, { message: 'Not Found' });
    }
    const rest = m[3] ?? '';

    if (rest === '' && method === 'GET') return json(200, repoJson(repo));
    let g: RegExpExecArray | null;
    if ((g = /^\/git\/ref\/heads\/(.+)$/.exec(rest)) && method === 'GET') {
      if (!repo.ref) return json(409, { message: 'Git Repository is empty.' });
      return json(200, { object: { sha: repo.ref } });
    }
    if ((g = /^\/contents\/(.+)$/.exec(rest)) && method === 'PUT') {
      const text = new TextDecoder().decode(Uint8Array.from(atob(body.content), (c) => c.charCodeAt(0)));
      const base = repo.ref ? repo.trees.get(repo.commits.get(repo.ref)!.tree)! : new Map<string, string>();
      const tree = new Map(base).set(g[1]!, this.blob(text));
      const treeSha = this.id('t');
      repo.trees.set(treeSha, tree);
      const c = this.id('c');
      repo.commits.set(c, { tree: treeSha, parents: repo.ref ? [repo.ref] : [], message: body.message });
      repo.ref = c;
      return json(201, { commit: { sha: c } });
    }
    if (!repo.ref && rest.startsWith('/git/')) return json(409, { message: 'Git Repository is empty.' });
    if ((g = /^\/git\/commits\/(\w+)$/.exec(rest)) && method === 'GET') {
      const c = repo.commits.get(g[1]!);
      return c ? json(200, { sha: g[1], tree: { sha: c.tree } }) : json(404, { message: 'Not Found' });
    }
    if ((g = /^\/git\/trees\/(\w+)$/.exec(rest)) && method === 'GET') {
      const t = repo.trees.get(g[1]!);
      if (!t) return json(404, { message: 'Not Found' });
      return json(200, { sha: g[1], truncated: false, tree: [...t].map(([path, sha]) => ({ path, type: 'blob', sha })) });
    }
    if ((g = /^\/git\/blobs\/(\w+)$/.exec(rest)) && method === 'GET') {
      const text = this.blobs.get(g[1]!);
      if (text === undefined) return json(404, { message: 'Not Found' });
      return json(200, { encoding: 'base64', content: b64(text) });
    }
    if (rest === '/git/trees' && method === 'POST') {
      const tree = new Map(repo.trees.get(body.base_tree) ?? []);
      for (const e of body.tree as Array<{ path: string; content?: string; sha?: null }>) {
        if (e.sha === null) tree.delete(e.path);
        else tree.set(e.path, this.blob(e.content!));
      }
      const sha = this.id('t');
      repo.trees.set(sha, tree);
      return json(201, { sha });
    }
    if (rest === '/git/commits' && method === 'POST') {
      const sha = this.id('c');
      repo.commits.set(sha, { tree: body.tree, parents: body.parents, message: body.message });
      return json(201, { sha });
    }
    if ((g = /^\/git\/refs\/heads\/(.+)$/.exec(rest)) && method === 'PATCH') {
      if (this.beforeRefUpdate) {
        const hook = this.beforeRefUpdate;
        this.beforeRefUpdate = undefined;
        await hook();
      }
      if (this.refUpdateFailures > 0) {
        this.refUpdateFailures--;
        return json(422, { message: 'Reference update failed' });
      }
      const c = repo.commits.get(body.sha);
      if (!c) return json(422, { message: 'Object does not exist' });
      if (!body.force && !c.parents.includes(repo.ref)) return json(422, { message: 'Update is not a fast forward' });
      repo.ref = body.sha;
      return json(200, { object: { sha: body.sha } });
    }
    return json(404, { message: 'Not Found' });
  };
}

function repoJson(r: Repo) {
  return { name: r.name, owner: { login: r.owner }, default_branch: r.branch, private: true };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function b64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  // GitHub wraps base64 at 60 columns; make sure the reader copes.
  return btoa(bin).replace(/.{60}/g, '$&\n');
}
