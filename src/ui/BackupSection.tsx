/**
 * Settings → Back up & sync. Written for someone who has never heard of
 * GitHub: sign in once, then it just works. No "repository", "token" or
 * "commit" in the normal path.
 */
import { useState } from 'react';
import { connectWithToken, createBackupUrl, signInAvailable, startInstall, startSignIn } from '../app/auth';
import { syncService, useSyncStatus } from '../app/syncService';
import { relativeDate } from './format';

export function BackupSection({ now }: { now: string }) {
  const status = useSyncStatus();
  return (
    <section className="settings-section backup">
      <h2>Back up &amp; sync</h2>
      {status.state === 'off' ? <SignedOut /> : <SignedIn now={now} />}
    </section>
  );
}

const STEP1_DONE = 'schema.backupCreated';

function SignedOut() {
  const status = useSyncStatus();
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(() => {
    try {
      return localStorage.getItem(STEP1_DONE) === '1';
    } catch {
      return false;
    }
  });
  const markCreated = () => {
    setCreated(true);
    try {
      localStorage.setItem(STEP1_DONE, '1');
    } catch {
      // fine: it's only a hint for this screen
    }
  };

  return (
    <>
      <p>
        Keep your schema safe, and the same on your phone and your computer. It's saved in a private place in your own free GitHub account — only
        you can see it.
      </p>
      {status.signingIn && <p className="notice">Finishing sign-in…</p>}
      {status.signInError && <p className="warning">{status.signInError}</p>}
      {signInAvailable ? (
        <>
          <ol className="setup-steps">
            <li className={created ? 'done' : ''}>
              <strong>Create your private backup.</strong>
              {created ? (
                <span>
                  Done. If GitHub said the name <em>already exists</em>, that's fine — your backup is already there. Go on to step 2.{' '}
                  <a href={createBackupUrl()} target="_blank" rel="noreferrer">
                    Didn't finish? Open GitHub again
                  </a>
                </span>
              ) : (
                <>
                  <span>
                    GitHub opens with everything filled in. Tap <em>Create repository</em> at the bottom, then come back here. No GitHub account
                    yet? GitHub will offer to make one first — it's free.
                  </span>
                  <a className="button github-button" href={createBackupUrl()} target="_blank" rel="noreferrer" onClick={markCreated}>
                    <GitHubMark /> Create my backup on GitHub
                  </a>
                </>
              )}
            </li>
            <li>
              <strong>Let Schema use it.</strong>
              <span>
                On GitHub's next page, choose <em>Only select repositories</em>, pick <em>schema-private</em>, and tap <em>Install</em>. Schema can
                only ever see that one.
              </span>
              <button
                className={`button github-button${created ? ' primary' : ''}`}
                disabled={busy || status.signingIn}
                onClick={() => {
                  setBusy(true);
                  startInstall();
                }}
              >
                <GitHubMark /> Connect Schema to my backup
              </button>
            </li>
          </ol>
          <p className="muted small">
            Already did this on another device?{' '}
            <button
              className="link-button"
              disabled={busy || status.signingIn}
              onClick={async () => {
                setBusy(true);
                await startSignIn();
              }}
            >
              Just sign in with GitHub
            </button>
          </p>
        </>
      ) : (
        <p className="muted small">One-click sign-in isn't set up on this copy of Schema yet. You can connect with a token below.</p>
      )}
      <TokenConnect open={!signInAvailable} />
    </>
  );
}

function TokenConnect({ open }: { open: boolean }) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <details className="token-connect" open={open}>
      <summary>Use a token instead (for developers)</summary>
      <p className="muted small">
        Create a{' '}
        <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">
          fine-grained personal access token
        </a>{' '}
        with <strong>Contents</strong> and <strong>Administration</strong> set to read and write (Administration lets Schema create its private{' '}
        <code>schema-private</code> repository the first time). It's kept only on this device.
      </p>
      <form
        className="token-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!token.trim()) return;
          setBusy(true);
          syncService.reportSignInError(undefined);
          try {
            await syncService.connect(await connectWithToken(token));
            setToken('');
          } catch (err) {
            syncService.reportSignInError(err instanceof Error ? err.message : String(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="github_pat_…" aria-label="GitHub token" autoComplete="off" />
        <button className="button" disabled={busy || !token.trim()}>
          {busy ? 'Connecting…' : 'Connect'}
        </button>
      </form>
    </details>
  );
}

function SignedIn({ now }: { now: string }) {
  const s = useSyncStatus();
  const [confirm, setConfirm] = useState(false);
  const line = (() => {
    switch (s.state) {
      case 'syncing':
        return <span className="sync-line syncing">Syncing…</span>;
      case 'offline':
        return <span className="sync-line offline">Offline. Your tidbits are safe on this device and will sync when you're back online.</span>;
      case 'error':
        return <span className="sync-line error">{s.message ?? "Couldn't sync."}</span>;
      default:
        return (
          <span className="sync-line ok">
            ✓ Backed up{s.lastSyncAt ? ` · synced ${relativeDate(s.lastSyncAt, now)}` : ''}
          </span>
        );
    }
  })();
  return (
    <>
      <p className="sync-status">{line}</p>
      <p className="muted small">
        Signed in to GitHub as <strong>{s.account?.login}</strong>.{' '}
        {s.account && (
          <a href={s.account.webUrl} target="_blank" rel="noreferrer">
            See your backup on GitHub
          </a>
        )}
      </p>
      {s.needsSignIn ? (
        <div className="button-row">
          {signInAvailable && (
            <button className="button primary" onClick={() => void startSignIn()}>
              Sign in again
            </button>
          )}
          <button className="button" onClick={() => void syncService.disconnect()}>
            Sign out
          </button>
        </div>
      ) : confirm ? (
        <div className="discard-confirm">
          <span>Sign out on this device? Your tidbits stay here and in your backup; syncing just stops until you sign in again.</span>
          <button className="button small" onClick={() => setConfirm(false)}>
            Cancel
          </button>
          <button className="button small primary" onClick={() => void syncService.disconnect()}>
            Sign out
          </button>
        </div>
      ) : (
        <div className="button-row">
          <button className="button" onClick={() => syncService.syncNow()} disabled={s.state === 'syncing'}>
            Sync now
          </button>
          <button className="button subtle" onClick={() => setConfirm(true)}>
            Sign out on this device
          </button>
        </div>
      )}
    </>
  );
}

function GitHubMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
