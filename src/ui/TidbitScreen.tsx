/** One tidbit: current text, metadata, actions and its full history. */
import { useState } from 'react';
import { deleteTidbit, editMeta, finishTidbit, reactivateTidbit, reaffirmTidbit, reviseTidbit, spinOffTidbit } from '../app/actions';
import { href, navigate, useNow, useTidbits } from '../app/hooks';
import { allCategories, recentCategories } from '../core/categories';
import { CONFIDENCE_LABEL, KIND_INFO } from '../core/kinds';
import { connections, currentRevision, displayTitle } from '../core/tidbit';
import type { HistoryEntry, KindChange, Revision, Tidbit } from '../core/types';
import { longDate, monthYear, plural } from './format';
import { CategoryPicker, Icon, KindBadge, KindChips, RevisionBody, TagsField } from './parts';
import { RetirePanel } from './RetirePanel';
import { TidbitEditor } from './TidbitEditor';

type Mode = 'view' | 'revise' | 'meta' | 'retire' | 'delete' | 'practice';

export function TidbitScreen({ id }: { id: string }) {
  const tidbits = useTidbits();
  const now = useNow();
  const [mode, setMode] = useState<Mode>('view');
  const [pickKind, setPickKind] = useState(false);
  if (!tidbits) return null;
  const tidbit = tidbits.find((s) => s.id === id);
  if (!tidbit) {
    return (
      <div className="screen narrow">
        <p className="muted center">
          This tidbit isn't in your schema. <a href="#/schema">Back to the schema</a>
        </p>
      </div>
    );
  }
  const cur = currentRevision(tidbit);
  const linked = (sid: string) => tidbits.find((s) => s.id === sid);
  const successor = tidbit.links.find((l) => l.type === 'succeededBy');
  const predecessor = tidbit.links.find((l) => l.type === 'succeeds');

  return (
    <div className="screen narrow">
      <header className="screen-header">
        <button className="icon-button" onClick={() => history.back()} aria-label="Back">
          <Icon name="back" />
        </button>
        <div className="card-meta">
          <button
            className="kind-button"
            onClick={() => setPickKind(!pickKind)}
            aria-expanded={pickKind}
            title={tidbit.kind ? 'Change kind' : 'Choose a kind'}
          >
            {tidbit.kind ? <KindBadge kind={tidbit.kind} /> : <span className="kind-badge empty">+ Kind</span>}
          </button>
          {tidbit.category ? (
            <a className="cat" href={href({ name: 'schema', category: tidbit.category })}>
              {tidbit.category}
            </a>
          ) : (
            <span className="cat unsorted">Unsorted</span>
          )}
          {cur.confidence && <span className="confidence">{CONFIDENCE_LABEL[cur.confidence]}</span>}
          {tidbit.status !== 'active' && tidbit.status !== 'draft' && <span className="status-label">{tidbit.status}</span>}
        </div>
      </header>

      {pickKind && (
        <div className="kind-picker">
          <KindChips
            value={tidbit.kind}
            onChange={(k) => {
              void editMeta(tidbit.id, { kind: k ?? null });
              setPickKind(false);
            }}
          />
          {tidbit.kind && tidbit.status !== 'draft' && <p className="muted small">Switching kinds is noted in the history.</p>}
        </div>
      )}

      {tidbit.status === 'draft' && (
        <div className="banner draft-banner">
          <span>
            <strong>Draft.</strong> It stays out of reviews until you mark it done.
          </span>
          <button className="button small primary" onClick={() => void finishTidbit(tidbit.id)}>
            Done
          </button>
        </div>
      )}

      {(tidbit.status === 'dormant' || tidbit.status === 'succeeded') && (
        <div className="banner">
          {tidbit.status === 'dormant' ? 'Dormant' : 'Succeeded'} since {longDate(tidbit.retired?.at ?? tidbit.updated, now)}
          {tidbit.retired?.why && <> — “{tidbit.retired.why}”</>}
          {successor && linked(successor.tidbit) && (
            <>
              {' '}
              · replaced by <a href={href({ name: 'tidbit', id: successor.tidbit })}>{displayTitle(linked(successor.tidbit)!)}</a>
            </>
          )}
        </div>
      )}
      {predecessor && linked(predecessor.tidbit) && (
        <div className="banner subtle">
          Replaces <a href={href({ name: 'tidbit', id: predecessor.tidbit })}>{displayTitle(linked(predecessor.tidbit)!)}</a>
        </div>
      )}

      <article className="tidbit-page">
        {tidbit.title && <h1 className="tidbit-title">{tidbit.title}</h1>}
        <RevisionBody rev={cur} size="large" />
        {tidbit.source && <div className="source">— {tidbit.source}</div>}
        {tidbit.tags.length > 0 && (
          <div className="tags">
            {tidbit.tags.map((t) => (
              <a key={t} className="tag" href={href({ name: 'schema', query: t })}>
                #{t}
              </a>
            ))}
          </div>
        )}
      </article>

      {mode === 'view' && (
        <div className="tidbit-actions">
          {tidbit.status === 'draft' ? (
            <>
              <button className="button primary" onClick={() => setMode('revise')}>
                Revise
              </button>
              <button className="button" onClick={() => setMode('meta')}>
                Edit labels
              </button>
            </>
          ) : tidbit.status === 'active' ? (
            <>
              <button className="button primary" onClick={() => setMode('revise')}>
                Revise
              </button>
              <button className="button" onClick={() => void reaffirmTidbit(tidbit.id)} title="Record that you still hold this">
                Still true
              </button>
              <button className="button" onClick={() => setMode('meta')}>
                Edit labels
              </button>
              <button className="button" onClick={() => setMode('retire')}>
                Retire
              </button>
              {tidbit.kind !== 'practice' && (
                <button className="button" onClick={() => setMode('practice')} title="Start a habit or personal rule that grows out of this">
                  Make it a practice
                </button>
              )}
            </>
          ) : (
            <>
              <button className="button" onClick={() => void reactivateTidbit(tidbit.id)}>
                Make active again
              </button>
              <button className="button" onClick={() => setMode('meta')}>
                Edit labels
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
          <TidbitEditor
            mode="revise"
            initial={{ text: cur.text, details: cur.details, confidence: cur.confidence }}
            onCancel={() => setMode('view')}
            onSave={async ({ text, details, confidence, why }) => {
              await reviseTidbit(tidbit.id, { text, details, confidence, why });
              setMode('view');
            }}
          />
        </div>
      )}
      {mode === 'practice' && (
        <div className="panel">
          <h3>Make it a practice</h3>
          <p className="muted">What will you do because of this? Both tidbits stay, linked to each other.</p>
          <TidbitEditor
            mode="new"
            initial={{ text: '', kind: 'practice', category: tidbit.category, tags: tidbit.tags }}
            categories={allCategories(tidbits)}
            recentCategories={recentCategories(tidbits)}
            saveLabel="Save practice"
            onCancel={() => setMode('view')}
            onSave={async (input) => {
              const child = await spinOffTidbit(tidbit.id, input);
              setMode('view');
              navigate({ name: 'tidbit', id: child.id });
            }}
          />
        </div>
      )}
      {mode === 'meta' && <MetaEditor tidbit={tidbit} tidbits={tidbits} onDone={() => setMode('view')} />}
      {mode === 'retire' && (
        <RetirePanel
          tidbit={tidbit}
          categories={allCategories(tidbits)}
          onCancel={() => setMode('view')}
          onDone={(successorId) => {
            setMode('view');
            if (successorId) navigate({ name: 'tidbit', id: successorId });
          }}
        />
      )}
      {mode === 'delete' && (
        <div className="panel danger-panel">
          <h3>Delete this tidbit?</h3>
          <p>
            This removes the tidbit and its whole history from this device. It can't be undone. If you've outgrown it,{' '}
            <strong>Retire</strong> keeps the record of what you used to think.
          </p>
          <div className="editor-actions">
            <button className="button" onClick={() => setMode('view')}>
              Cancel
            </button>
            <button
              className="button danger"
              onClick={async () => {
                await deleteTidbit(tidbit.id);
                navigate({ name: 'schema' }, true);
              }}
            >
              Delete forever
            </button>
          </div>
        </div>
      )}

      <Connections tidbit={tidbit} tidbits={tidbits} />
      <History tidbit={tidbit} now={now} />
    </div>
  );
}

function MetaEditor({ tidbit, tidbits, onDone }: { tidbit: Tidbit; tidbits: Tidbit[]; onDone: () => void }) {
  const [title, setTitle] = useState(tidbit.title ?? '');
  const [source, setSource] = useState(tidbit.source ?? '');
  const others = tidbits.filter((s) => s.id !== tidbit.id);
  return (
    <div className="panel">
      <h3>Labels</h3>
      <p className="muted">Labels change in place. To change what the tidbit says, revise it.</p>
      {tidbit.title !== undefined && (
        <label className="field">
          <span className="field-label">Title (older tidbits only — clear it to use the tidbit as the headline)</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => void editMeta(tidbit.id, { title })} />
        </label>
      )}
      <div className="field-label">Kind</div>
      <KindChips value={tidbit.kind} onChange={(k) => void editMeta(tidbit.id, { kind: k ?? null })} />
      <div className="field-label">Category</div>
      <CategoryPicker
        value={tidbit.category}
        recent={recentCategories(others)}
        all={allCategories(others)}
        onChange={(c) => void editMeta(tidbit.id, { category: c ?? null })}
      />
      <label className="field">
        <span className="field-label">Tags</span>
        <TagsField value={tidbit.tags} onChange={(tags) => void editMeta(tidbit.id, { tags })} />
      </label>
      <label className="field">
        <span className="field-label">Source</span>
        <input value={source} onChange={(e) => setSource(e.target.value)} onBlur={() => void editMeta(tidbit.id, { source })} placeholder={tidbit.kind === 'quote' ? 'Who said it?' : 'Optional'} />
      </label>
      <div className="editor-actions">
        <button
          className="button primary"
          onClick={async () => {
            await editMeta(tidbit.id, { title, source });
            onDone();
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}

type Group =
  | { type: 'revision'; rev: Revision; isCurrent: boolean }
  | { type: 'reaffirmations'; ats: string[] }
  | { type: 'kindChange'; change: KindChange };

/** History, newest first. Runs of reaffirmations collapse into one line. */
function groupHistory(history: HistoryEntry[]): Group[] {
  const out: Group[] = [];
  let firstRev = true;
  for (const e of history) {
    if (e.type === 'kindChange') {
      out.push({ type: 'kindChange', change: e });
    } else if (e.type === 'reaffirmation') {
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

function History({ tidbit, now }: { tidbit: Tidbit; now: string }) {
  const groups = groupHistory(tidbit.history);
  const revCount = groups.filter((g) => g.type === 'revision').length;
  return (
    <section className="history" aria-label="History">
      <h2>
        History <span className="muted">· {plural(revCount, 'revision')}</span>
      </h2>
      <ol className="timeline">
        {groups.map((g, i) =>
          g.type === 'kindChange' ? (
            <li key={i} className="tl-kind">
              <span className="tl-dot small" />
              {KIND_INFO[g.change.from].label} → {KIND_INFO[g.change.to].label} · {longDate(g.change.at, now)}
            </li>
          ) : g.type === 'reaffirmations' ? (
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
              {!g.isCurrent && <RevisionBody rev={g.rev} size="small" />}
              {g.rev.why && <div className="tl-why">Why it changed: {g.rev.why}</div>}
            </li>
          ),
        )}
      </ol>
    </section>
  );
}

/** Tidbits linked to this one, either direction. Replacements are shown in the banners above instead. */
function Connections({ tidbit, tidbits }: { tidbit: Tidbit; tidbits: Tidbit[] }) {
  const list = connections(tidbit, tidbits).filter((c) => c.label !== 'Replaces' && c.label !== 'Replaced by');
  if (!list.length) return null;
  return (
    <section className="connections" aria-label="Connected tidbits">
      <h2>Connected</h2>
      {list.map((c) => (
        <a key={c.label + c.tidbit.id} className="connection" href={href({ name: 'tidbit', id: c.tidbit.id })}>
          <span className="connection-label">{c.label}</span>
          <span className="connection-title">{displayTitle(c.tidbit)}</span>
          <KindBadge kind={c.tidbit.kind} />
        </a>
      ))}
    </section>
  );
}
