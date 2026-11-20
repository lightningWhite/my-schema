/**
 * Organize: drafts, one at a time, oldest first. Quick captures land here.
 * Tidy the wording, give it a kind and category, then mark it Done — or
 * discard it if it wasn't worth keeping after all.
 */
import { useMemo, useState } from 'react';
import { deleteTidbit, editMeta, finishTidbit, reviseTidbit } from '../app/actions';
import { href, useTidbits, useNow } from '../app/hooks';
import { allCategories, recentCategories } from '../core/categories';
import { KIND_INFO } from '../core/kinds';
import { createdAt, currentRevision, isDraft, isUnsorted } from '../core/tidbit';
import { cmpAt } from '../core/time';
import type { Tidbit } from '../core/types';
import { plural, relativeDate } from './format';
import { TidbitEditor } from './TidbitEditor';
import { CategoryPicker, ConfidenceChips, Empty, KindChips, RevisionBody } from './parts';

export function OrganizeScreen() {
  const tidbits = useTidbits();
  const now = useNow();
  const [skipped, setSkipped] = useState<string[]>([]);

  const queue = useMemo(() => (tidbits ?? []).filter(isDraft).sort((a, b) => cmpAt(createdAt(a), createdAt(b))), [tidbits]);
  if (!tidbits) return null;

  const pending = queue.filter((g) => !skipped.includes(g.id));
  const tidbit = pending[0];
  const uncategorized = tidbits.filter((g) => g.status === 'active' && isUnsorted(g)).length;

  if (!tidbit) {
    return (
      <div className="screen narrow">
        <header className="screen-header">
          <h1>Organize</h1>
        </header>
        <Empty title={queue.length ? 'Nothing else to organize right now' : 'No drafts'}>
          {queue.length ? (
            <button className="button" onClick={() => setSkipped([])}>
              Go back to the {plural(queue.length, 'skipped draft')}
            </button>
          ) : (
            <p>Tidbits you add on the home screen wait here as drafts until you have a minute to look them over.</p>
          )}
          {uncategorized > 0 && (
            <p>
              <a href={href({ name: 'schema', category: '\u0000unsorted' })}>{plural(uncategorized, 'tidbit')} without a category</a>
            </p>
          )}
        </Empty>
      </div>
    );
  }

  return (
    <div className="screen narrow">
      <header className="screen-header">
        <h1>Organize</h1>
        <span className="header-count">{plural(pending.length, 'draft')}</span>
      </header>
      <DraftCard key={tidbit.id} tidbit={tidbit} tidbits={tidbits} now={now} onSkip={() => setSkipped((s) => [...s, tidbit.id])} />
    </div>
  );
}

function DraftCard({ tidbit, tidbits, now, onSkip }: { tidbit: Tidbit; tidbits: Tidbit[]; now: string; onSkip: () => void }) {
  const [mode, setMode] = useState<'view' | 'edit' | 'discard'>('view');
  const cur = currentRevision(tidbit);
  const others = tidbits.filter((g) => g.id !== tidbit.id);
  const showConfidence = !tidbit.kind || KIND_INFO[tidbit.kind].hasConfidence;

  return (
    <article className="card organize-card">
      <div className="card-meta">
        Captured {relativeDate(createdAt(tidbit), now)} · <a href={href({ name: 'tidbit', id: tidbit.id })}>Open</a>
      </div>
      {tidbit.title && <h2 className="card-title">{tidbit.title}</h2>}

      {mode === 'edit' ? (
        <TidbitEditor
          mode="revise"
          initial={{ text: cur.text, details: cur.details, confidence: cur.confidence }}
          saveLabel="Save"
          onCancel={() => setMode('view')}
          onSave={async ({ text, details, confidence, why }) => {
            await reviseTidbit(tidbit.id, { text, details, confidence, why });
            setMode('view');
          }}
        />
      ) : (
        <>
          <RevisionBody rev={cur} />
          <button className="link-button small-link" onClick={() => setMode('edit')}>
            Edit wording or add details
          </button>
        </>
      )}

      <div className="field-label">Kind</div>
      <KindChips value={tidbit.kind} onChange={(k) => void editMeta(tidbit.id, { kind: k ?? null })} />

      <div className="field-label">Category</div>
      <CategoryPicker
        value={tidbit.category}
        recent={recentCategories(others, 8)}
        all={allCategories(others)}
        onChange={(c) => void editMeta(tidbit.id, { category: c ?? null })}
      />

      {showConfidence && (
        <>
          <div className="field-label">Confidence</div>
          <ConfidenceChips
            value={cur.confidence}
            onChange={(c) => void reviseTidbit(tidbit.id, { text: cur.text, details: cur.details ?? '', confidence: c })}
          />
        </>
      )}

      {mode === 'discard' ? (
        <div className="discard-confirm">
          <span>Discard this draft? It's deleted from this device.</span>
          <button className="button small" onClick={() => setMode('view')}>
            Keep it
          </button>
          <button className="button small danger" onClick={() => void deleteTidbit(tidbit.id)}>
            Discard
          </button>
        </div>
      ) : (
        <div className="card-actions spread">
          <button className="button danger subtle" onClick={() => setMode('discard')}>
            Discard
          </button>
          <span className="spacer" />
          <button className="button" onClick={onSkip}>
            Skip for now
          </button>
          <button className="button primary" onClick={() => void finishTidbit(tidbit.id)}>
            Done
          </button>
        </div>
      )}
    </article>
  );
}
