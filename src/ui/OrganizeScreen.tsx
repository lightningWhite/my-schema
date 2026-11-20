/**
 * Organize: drafts, one at a time, oldest first. Quick captures land here.
 * Tidy the wording, give it a kind and category, then mark it Done — or
 * discard it if it wasn't worth keeping after all.
 */
import { useMemo, useState } from 'react';
import { deleteGrain, editMeta, finishGrain, reviseGrain } from '../app/actions';
import { href, useGrains, useNow } from '../app/hooks';
import { allCategories, recentCategories } from '../core/categories';
import { KIND_INFO } from '../core/kinds';
import { createdAt, currentRevision, isDraft, isUnsorted } from '../core/grain';
import { cmpAt } from '../core/time';
import type { Grain } from '../core/types';
import { plural, relativeDate } from './format';
import { GrainEditor } from './GrainEditor';
import { CategoryPicker, ConfidenceChips, Empty, KindChips, RevisionBody } from './parts';

export function OrganizeScreen() {
  const grains = useGrains();
  const now = useNow();
  const [skipped, setSkipped] = useState<string[]>([]);

  const queue = useMemo(() => (grains ?? []).filter(isDraft).sort((a, b) => cmpAt(createdAt(a), createdAt(b))), [grains]);
  if (!grains) return null;

  const pending = queue.filter((g) => !skipped.includes(g.id));
  const grain = pending[0];
  const uncategorized = grains.filter((g) => g.status === 'active' && isUnsorted(g)).length;

  if (!grain) {
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
              <a href={href({ name: 'schema', category: '\u0000unsorted' })}>{plural(uncategorized, 'grain')} without a category</a>
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
      <DraftCard key={grain.id} grain={grain} grains={grains} now={now} onSkip={() => setSkipped((s) => [...s, grain.id])} />
    </div>
  );
}

function DraftCard({ grain, grains, now, onSkip }: { grain: Grain; grains: Grain[]; now: string; onSkip: () => void }) {
  const [mode, setMode] = useState<'view' | 'edit' | 'discard'>('view');
  const cur = currentRevision(grain);
  const others = grains.filter((g) => g.id !== grain.id);
  const showConfidence = !grain.kind || KIND_INFO[grain.kind].hasConfidence;

  return (
    <article className="card organize-card">
      <div className="card-meta">
        Captured {relativeDate(createdAt(grain), now)} · <a href={href({ name: 'grain', id: grain.id })}>Open</a>
      </div>
      {grain.title && <h2 className="card-title">{grain.title}</h2>}

      {mode === 'edit' ? (
        <GrainEditor
          mode="revise"
          initial={{ text: cur.text, details: cur.details, confidence: cur.confidence }}
          saveLabel="Save"
          onCancel={() => setMode('view')}
          onSave={async ({ text, details, confidence, why }) => {
            await reviseGrain(grain.id, { text, details, confidence, why });
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
      <KindChips value={grain.kind} onChange={(k) => void editMeta(grain.id, { kind: k ?? null })} />

      <div className="field-label">Category</div>
      <CategoryPicker
        value={grain.category}
        recent={recentCategories(others, 8)}
        all={allCategories(others)}
        onChange={(c) => void editMeta(grain.id, { category: c ?? null })}
      />

      {showConfidence && (
        <>
          <div className="field-label">Confidence</div>
          <ConfidenceChips
            value={cur.confidence}
            onChange={(c) => void reviseGrain(grain.id, { text: cur.text, details: cur.details ?? '', confidence: c })}
          />
        </>
      )}

      {mode === 'discard' ? (
        <div className="discard-confirm">
          <span>Discard this draft? It's deleted from this device.</span>
          <button className="button small" onClick={() => setMode('view')}>
            Keep it
          </button>
          <button className="button small danger" onClick={() => void deleteGrain(grain.id)}>
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
          <button className="button primary" onClick={() => void finishGrain(grain.id)}>
            Done
          </button>
        </div>
      )}
    </article>
  );
}
