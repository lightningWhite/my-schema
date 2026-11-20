/** One grain: current text, metadata, actions and its full history. */
import { useState } from 'react';
import { deleteGrain, editMeta, finishGrain, reactivateGrain, reaffirmGrain, reviseGrain, spinOffGrain } from '../app/actions';
import { href, navigate, useNow, useGrains } from '../app/hooks';
import { allCategories, recentCategories } from '../core/categories';
import { CONFIDENCE_LABEL, KIND_INFO } from '../core/kinds';
import { connections, currentRevision, displayTitle } from '../core/grain';
import type { HistoryEntry, KindChange, Revision, Grain } from '../core/types';
import { longDate, monthYear, plural } from './format';
import { CategoryPicker, Icon, KindBadge, KindChips, RevisionBody, TagsField } from './parts';
import { RetirePanel } from './RetirePanel';
import { GrainEditor } from './GrainEditor';

type Mode = 'view' | 'revise' | 'meta' | 'retire' | 'delete' | 'practice';

export function GrainScreen({ id }: { id: string }) {
  const grains = useGrains();
  const now = useNow();
  const [mode, setMode] = useState<Mode>('view');
  const [pickKind, setPickKind] = useState(false);
  if (!grains) return null;
  const grain = grains.find((s) => s.id === id);
  if (!grain) {
    return (
      <div className="screen narrow">
        <p className="muted center">
          This grain isn't in your schema. <a href="#/schema">Back to the schema</a>
        </p>
      </div>
    );
  }
  const cur = currentRevision(grain);
  const linked = (sid: string) => grains.find((s) => s.id === sid);
  const successor = grain.links.find((l) => l.type === 'succeededBy');
  const predecessor = grain.links.find((l) => l.type === 'succeeds');

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
            title={grain.kind ? 'Change kind' : 'Choose a kind'}
          >
            {grain.kind ? <KindBadge kind={grain.kind} /> : <span className="kind-badge empty">+ Kind</span>}
          </button>
          {grain.category ? (
            <a className="cat" href={href({ name: 'schema', category: grain.category })}>
              {grain.category}
            </a>
          ) : (
            <span className="cat unsorted">Unsorted</span>
          )}
          {cur.confidence && <span className="confidence">{CONFIDENCE_LABEL[cur.confidence]}</span>}
          {grain.status !== 'active' && grain.status !== 'draft' && <span className="status-label">{grain.status}</span>}
        </div>
      </header>

      {pickKind && (
        <div className="kind-picker">
          <KindChips
            value={grain.kind}
            onChange={(k) => {
              void editMeta(grain.id, { kind: k ?? null });
              setPickKind(false);
            }}
          />
          {grain.kind && grain.status !== 'draft' && <p className="muted small">Switching kinds is noted in the history.</p>}
        </div>
      )}

      {grain.status === 'draft' && (
        <div className="banner draft-banner">
          <span>
            <strong>Draft.</strong> It stays out of reviews until you mark it done.
          </span>
          <button className="button small primary" onClick={() => void finishGrain(grain.id)}>
            Done
          </button>
        </div>
      )}

      {(grain.status === 'dormant' || grain.status === 'succeeded') && (
        <div className="banner">
          {grain.status === 'dormant' ? 'Dormant' : 'Succeeded'} since {longDate(grain.retired?.at ?? grain.updated, now)}
          {grain.retired?.why && <> — “{grain.retired.why}”</>}
          {successor && linked(successor.grain) && (
            <>
              {' '}
              · replaced by <a href={href({ name: 'grain', id: successor.grain })}>{displayTitle(linked(successor.grain)!)}</a>
            </>
          )}
        </div>
      )}
      {predecessor && linked(predecessor.grain) && (
        <div className="banner subtle">
          Replaces <a href={href({ name: 'grain', id: predecessor.grain })}>{displayTitle(linked(predecessor.grain)!)}</a>
        </div>
      )}

      <article className="grain-page">
        {grain.title && <h1 className="grain-title">{grain.title}</h1>}
        <RevisionBody rev={cur} size="large" />
        {grain.source && <div className="source">— {grain.source}</div>}
        {grain.tags.length > 0 && (
          <div className="tags">
            {grain.tags.map((t) => (
              <a key={t} className="tag" href={href({ name: 'schema', query: t })}>
                #{t}
              </a>
            ))}
          </div>
        )}
      </article>

      {mode === 'view' && (
        <div className="grain-actions">
          {grain.status === 'draft' ? (
            <>
              <button className="button primary" onClick={() => setMode('revise')}>
                Revise
              </button>
              <button className="button" onClick={() => setMode('meta')}>
                Edit labels
              </button>
            </>
          ) : grain.status === 'active' ? (
            <>
              <button className="button primary" onClick={() => setMode('revise')}>
                Revise
              </button>
              <button className="button" onClick={() => void reaffirmGrain(grain.id)} title="Record that you still hold this">
                Still true
              </button>
              <button className="button" onClick={() => setMode('meta')}>
                Edit labels
              </button>
              <button className="button" onClick={() => setMode('retire')}>
                Retire
              </button>
              {grain.kind !== 'practice' && (
                <button className="button" onClick={() => setMode('practice')} title="Start a habit or personal rule that grows out of this">
                  Make it a practice
                </button>
              )}
            </>
          ) : (
            <>
              <button className="button" onClick={() => void reactivateGrain(grain.id)}>
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
          <GrainEditor
            mode="revise"
            initial={{ text: cur.text, details: cur.details, confidence: cur.confidence }}
            onCancel={() => setMode('view')}
            onSave={async ({ text, details, confidence, why }) => {
              await reviseGrain(grain.id, { text, details, confidence, why });
              setMode('view');
            }}
          />
        </div>
      )}
      {mode === 'practice' && (
        <div className="panel">
          <h3>Make it a practice</h3>
          <p className="muted">What will you do because of this? Both grains stay, linked to each other.</p>
          <GrainEditor
            mode="new"
            initial={{ text: '', kind: 'practice', category: grain.category, tags: grain.tags }}
            categories={allCategories(grains)}
            recentCategories={recentCategories(grains)}
            saveLabel="Save practice"
            onCancel={() => setMode('view')}
            onSave={async (input) => {
              const child = await spinOffGrain(grain.id, input);
              setMode('view');
              navigate({ name: 'grain', id: child.id });
            }}
          />
        </div>
      )}
      {mode === 'meta' && <MetaEditor grain={grain} grains={grains} onDone={() => setMode('view')} />}
      {mode === 'retire' && (
        <RetirePanel
          grain={grain}
          categories={allCategories(grains)}
          onCancel={() => setMode('view')}
          onDone={(successorId) => {
            setMode('view');
            if (successorId) navigate({ name: 'grain', id: successorId });
          }}
        />
      )}
      {mode === 'delete' && (
        <div className="panel danger-panel">
          <h3>Delete this grain?</h3>
          <p>
            This removes the grain and its whole history from this device. It can't be undone. If you've outgrown it,{' '}
            <strong>Retire</strong> keeps the record of what you used to think.
          </p>
          <div className="editor-actions">
            <button className="button" onClick={() => setMode('view')}>
              Cancel
            </button>
            <button
              className="button danger"
              onClick={async () => {
                await deleteGrain(grain.id);
                navigate({ name: 'schema' }, true);
              }}
            >
              Delete forever
            </button>
          </div>
        </div>
      )}

      <Connections grain={grain} grains={grains} />
      <History grain={grain} now={now} />
    </div>
  );
}

function MetaEditor({ grain, grains, onDone }: { grain: Grain; grains: Grain[]; onDone: () => void }) {
  const [title, setTitle] = useState(grain.title ?? '');
  const [source, setSource] = useState(grain.source ?? '');
  const others = grains.filter((s) => s.id !== grain.id);
  return (
    <div className="panel">
      <h3>Labels</h3>
      <p className="muted">Labels change in place. To change what the grain says, revise it.</p>
      {grain.title !== undefined && (
        <label className="field">
          <span className="field-label">Title (older grains only — clear it to use the tidbit as the headline)</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => void editMeta(grain.id, { title })} />
        </label>
      )}
      <div className="field-label">Kind</div>
      <KindChips value={grain.kind} onChange={(k) => void editMeta(grain.id, { kind: k ?? null })} />
      <div className="field-label">Category</div>
      <CategoryPicker
        value={grain.category}
        recent={recentCategories(others)}
        all={allCategories(others)}
        onChange={(c) => void editMeta(grain.id, { category: c ?? null })}
      />
      <label className="field">
        <span className="field-label">Tags</span>
        <TagsField value={grain.tags} onChange={(tags) => void editMeta(grain.id, { tags })} />
      </label>
      <label className="field">
        <span className="field-label">Source</span>
        <input value={source} onChange={(e) => setSource(e.target.value)} onBlur={() => void editMeta(grain.id, { source })} placeholder={grain.kind === 'quote' ? 'Who said it?' : 'Optional'} />
      </label>
      <div className="editor-actions">
        <button
          className="button primary"
          onClick={async () => {
            await editMeta(grain.id, { title, source });
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

function History({ grain, now }: { grain: Grain; now: string }) {
  const groups = groupHistory(grain.history);
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

/** Grains linked to this one, either direction. Replacements are shown in the banners above instead. */
function Connections({ grain, grains }: { grain: Grain; grains: Grain[] }) {
  const list = connections(grain, grains).filter((c) => c.label !== 'Replaces' && c.label !== 'Replaced by');
  if (!list.length) return null;
  return (
    <section className="connections" aria-label="Connected grains">
      <h2>Connected</h2>
      {list.map((c) => (
        <a key={c.label + c.grain.id} className="connection" href={href({ name: 'grain', id: c.grain.id })}>
          <span className="connection-label">{c.label}</span>
          <span className="connection-title">{displayTitle(c.grain)}</span>
          <KindBadge kind={c.grain.kind} />
        </a>
      ))}
    </section>
  );
}
