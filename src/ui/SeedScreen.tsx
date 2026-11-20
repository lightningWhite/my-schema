/** One seed: current text, metadata, actions and its full history. */
import { useState } from 'react';
import { deleteSeed, editMeta, reactivateSeed, reaffirmSeed, reviseSeed, spinOffSeed } from '../app/actions';
import { href, navigate, useNow, useSeeds } from '../app/hooks';
import { allCategories, recentCategories } from '../core/categories';
import { CONFIDENCE_LABEL } from '../core/kinds';
import { connections, currentRevision, displayTitle } from '../core/seed';
import type { HistoryEntry, Revision, Seed } from '../core/types';
import { longDate, monthYear, plural } from './format';
import { CategoryPicker, Icon, KindBadge, KindChips, SeedText, TagsField } from './parts';
import { RetirePanel } from './RetirePanel';
import { SeedEditor } from './SeedEditor';

type Mode = 'view' | 'revise' | 'meta' | 'retire' | 'delete' | 'practice';

export function SeedScreen({ id }: { id: string }) {
  const seeds = useSeeds();
  const now = useNow();
  const [mode, setMode] = useState<Mode>('view');
  if (!seeds) return null;
  const seed = seeds.find((s) => s.id === id);
  if (!seed) {
    return (
      <div className="screen narrow">
        <p className="muted center">
          This seed isn't in your bank. <a href="#/bank">Back to the bank</a>
        </p>
      </div>
    );
  }
  const cur = currentRevision(seed);
  const linked = (sid: string) => seeds.find((s) => s.id === sid);
  const successor = seed.links.find((l) => l.type === 'succeededBy');
  const predecessor = seed.links.find((l) => l.type === 'succeeds');

  return (
    <div className="screen narrow">
      <header className="screen-header">
        <button className="icon-button" onClick={() => history.back()} aria-label="Back">
          <Icon name="back" />
        </button>
        <div className="card-meta">
          <KindBadge kind={seed.kind} />
          {seed.category ? (
            <a className="cat" href={href({ name: 'bank', category: seed.category })}>
              {seed.category}
            </a>
          ) : (
            <span className="cat unsorted">Unsorted</span>
          )}
          {cur.confidence && <span className="confidence">{CONFIDENCE_LABEL[cur.confidence]}</span>}
          {seed.status !== 'active' && <span className="status-label">{seed.status}</span>}
        </div>
      </header>

      {seed.status !== 'active' && (
        <div className="banner">
          {seed.status === 'dormant' ? 'Dormant' : 'Succeeded'} since {longDate(seed.retired?.at ?? seed.updated, now)}
          {seed.retired?.why && <> — “{seed.retired.why}”</>}
          {successor && linked(successor.seed) && (
            <>
              {' '}
              · replaced by <a href={href({ name: 'seed', id: successor.seed })}>{displayTitle(linked(successor.seed)!)}</a>
            </>
          )}
        </div>
      )}
      {predecessor && linked(predecessor.seed) && (
        <div className="banner subtle">
          Replaces <a href={href({ name: 'seed', id: predecessor.seed })}>{displayTitle(linked(predecessor.seed)!)}</a>
        </div>
      )}

      <article className="seed-page">
        {seed.title && <h1 className="seed-title">{seed.title}</h1>}
        <SeedText text={cur.text} />
        {seed.source && <div className="source">— {seed.source}</div>}
        {seed.tags.length > 0 && (
          <div className="tags">
            {seed.tags.map((t) => (
              <a key={t} className="tag" href={href({ name: 'bank', query: t })}>
                #{t}
              </a>
            ))}
          </div>
        )}
      </article>

      {mode === 'view' && (
        <div className="seed-actions">
          {seed.status === 'active' ? (
            <>
              <button className="button primary" onClick={() => setMode('revise')}>
                Revise
              </button>
              <button className="button" onClick={() => void reaffirmSeed(seed.id)} title="Record that you still hold this">
                Still true
              </button>
              <button className="button" onClick={() => setMode('meta')}>
                Edit details
              </button>
              <button className="button" onClick={() => setMode('retire')}>
                Retire
              </button>
              {seed.kind !== 'practice' && (
                <button className="button" onClick={() => setMode('practice')} title="Start a habit or personal rule that grows out of this">
                  Make it a practice
                </button>
              )}
            </>
          ) : (
            <>
              <button className="button" onClick={() => void reactivateSeed(seed.id)}>
                Make active again
              </button>
              <button className="button" onClick={() => setMode('meta')}>
                Edit details
              </button>
            </>
          )}
          <button className="button danger subtle" onClick={() => setMode('delete')}>
            Delete
          </button>
        </div>
      )}

      {mode === 'revise' && (
        <div className="panel">
          <h3>New revision</h3>
          <p className="muted">The current text is kept in the history below.</p>
          <SeedEditor
            mode="revise"
            initial={{ text: cur.text, confidence: cur.confidence }}
            onCancel={() => setMode('view')}
            onSave={async ({ text, confidence, why }) => {
              await reviseSeed(seed.id, { text, confidence, why });
              setMode('view');
            }}
          />
        </div>
      )}
      {mode === 'practice' && (
        <div className="panel">
          <h3>Make it a practice</h3>
          <p className="muted">What will you do because of this? Both seeds stay, linked to each other.</p>
          <SeedEditor
            mode="new"
            initial={{ text: '', kind: 'practice', category: seed.category, tags: seed.tags }}
            categories={allCategories(seeds)}
            recentCategories={recentCategories(seeds)}
            saveLabel="Save practice"
            onCancel={() => setMode('view')}
            onSave={async (input) => {
              const child = await spinOffSeed(seed.id, input);
              setMode('view');
              navigate({ name: 'seed', id: child.id });
            }}
          />
        </div>
      )}
      {mode === 'meta' && <MetaEditor seed={seed} seeds={seeds} onDone={() => setMode('view')} />}
      {mode === 'retire' && (
        <RetirePanel
          seed={seed}
          categories={allCategories(seeds)}
          onCancel={() => setMode('view')}
          onDone={(successorId) => {
            setMode('view');
            if (successorId) navigate({ name: 'seed', id: successorId });
          }}
        />
      )}
      {mode === 'delete' && (
        <div className="panel danger-panel">
          <h3>Delete this seed?</h3>
          <p>
            This removes the seed and its whole history from this device. It can't be undone. If you've outgrown it,{' '}
            <strong>Retire</strong> keeps the record of what you used to think.
          </p>
          <div className="editor-actions">
            <button className="button" onClick={() => setMode('view')}>
              Cancel
            </button>
            <button
              className="button danger"
              onClick={async () => {
                await deleteSeed(seed.id);
                navigate({ name: 'bank' }, true);
              }}
            >
              Delete forever
            </button>
          </div>
        </div>
      )}

      <Connections seed={seed} seeds={seeds} />
      <History seed={seed} now={now} />
    </div>
  );
}

function MetaEditor({ seed, seeds, onDone }: { seed: Seed; seeds: Seed[]; onDone: () => void }) {
  const [title, setTitle] = useState(seed.title ?? '');
  const [source, setSource] = useState(seed.source ?? '');
  const others = seeds.filter((s) => s.id !== seed.id);
  return (
    <div className="panel">
      <h3>Details</h3>
      <p className="muted">Details change in place. To change what the seed says, revise it.</p>
      <label className="field">
        <span className="field-label">Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => void editMeta(seed.id, { title })} placeholder="Optional" />
      </label>
      <div className="field-label">Kind</div>
      <KindChips value={seed.kind} onChange={(k) => void editMeta(seed.id, { kind: k ?? null })} />
      <div className="field-label">Category</div>
      <CategoryPicker
        value={seed.category}
        recent={recentCategories(others)}
        all={allCategories(others)}
        onChange={(c) => void editMeta(seed.id, { category: c ?? null })}
      />
      <label className="field">
        <span className="field-label">Tags</span>
        <TagsField value={seed.tags} onChange={(tags) => void editMeta(seed.id, { tags })} />
      </label>
      <label className="field">
        <span className="field-label">Source</span>
        <input value={source} onChange={(e) => setSource(e.target.value)} onBlur={() => void editMeta(seed.id, { source })} placeholder={seed.kind === 'quote' ? 'Who said it?' : 'Optional'} />
      </label>
      <div className="editor-actions">
        <button
          className="button primary"
          onClick={async () => {
            await editMeta(seed.id, { title, source });
            onDone();
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}

type Group = { type: 'revision'; rev: Revision; isCurrent: boolean } | { type: 'reaffirmations'; ats: string[] };

/** History, newest first. Runs of reaffirmations collapse into one line. */
function groupHistory(history: HistoryEntry[]): Group[] {
  const out: Group[] = [];
  let firstRev = true;
  for (const e of history) {
    if (e.type === 'reaffirmation') {
      const last = out[out.length - 1];
      if (last?.type === 'reaffirmations') last.ats.push(e.at);
      else out.push({ type: 'reaffirmations', ats: [e.at] });
    } else {
      out.push({ type: 'revision', rev: e, isCurrent: firstRev });
      firstRev = false;
    }
  }
  return out;
}

function History({ seed, now }: { seed: Seed; now: string }) {
  const groups = groupHistory(seed.history);
  const revCount = groups.filter((g) => g.type === 'revision').length;
  return (
    <section className="history" aria-label="History">
      <h2>
        History <span className="muted">· {plural(revCount, 'revision')}</span>
      </h2>
      <ol className="timeline">
        {groups.map((g, i) =>
          g.type === 'reaffirmations' ? (
            <li key={i} className="tl-reaffirm">
              <span className="tl-dot small" />
              {g.ats.length === 1
                ? `Reaffirmed ${longDate(g.ats[0]!, now)}`
                : `Reaffirmed ${g.ats.length} times, last ${monthYear(g.ats[0]!)}`}
            </li>
          ) : (
            <li key={g.rev.at} className={`tl-rev${g.isCurrent ? ' current' : ''}`}>
              <span className="tl-dot" />
              <div className="tl-head">
                {longDate(g.rev.at, now)}
                {g.rev.confidence && <span className="confidence">{CONFIDENCE_LABEL[g.rev.confidence]}</span>}
                {g.isCurrent && <span className="current-label">current</span>}
              </div>
              {!g.isCurrent && <SeedText text={g.rev.text} />}
              {g.rev.why && <div className="tl-why">Why it changed: {g.rev.why}</div>}
            </li>
          ),
        )}
      </ol>
    </section>
  );
}

/** Seeds linked to this one, either direction. Replacements are shown in the banners above instead. */
function Connections({ seed, seeds }: { seed: Seed; seeds: Seed[] }) {
  const list = connections(seed, seeds).filter((c) => c.label !== 'Replaces' && c.label !== 'Replaced by');
  if (!list.length) return null;
  return (
    <section className="connections" aria-label="Connected seeds">
      <h2>Connected</h2>
      {list.map((c) => (
        <a key={c.label + c.seed.id} className="connection" href={href({ name: 'seed', id: c.seed.id })}>
          <span className="connection-label">{c.label}</span>
          <span className="connection-title">{displayTitle(c.seed)}</span>
          <KindBadge kind={c.seed.kind} />
        </a>
      ))}
    </section>
  );
}
