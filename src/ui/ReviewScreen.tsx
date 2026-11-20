/**
 * Today's review (docs/design.md §4): a handful of grains, one at a time.
 * Still true · Revise · Retire · Skip.
 */
import { useState } from 'react';
import { reaffirmGrain, reviseGrain, skipGrain } from '../app/actions';
import { href, useNow, useReviewState, useGrains, useSettings } from '../app/hooks';
import { allCategories } from '../core/categories';
import { CONFIDENCE_LABEL } from '../core/kinds';
import { dailyReview } from '../core/review';
import { createdAt, currentRevision, revisions } from '../core/grain';
import type { Grain } from '../core/types';
import { longDate, plural, relativeDate } from './format';
import { Empty, KindBadge, RevisionBody } from './parts';
import { RetirePanel } from './RetirePanel';
import { GrainEditor } from './GrainEditor';

export function ReviewScreen() {
  const grains = useGrains();
  const state = useReviewState();
  const settings = useSettings();
  const now = useNow();
  const [doneCount, setDoneCount] = useState(0);
  if (!grains || !state) return null;

  const queue = dailyReview(grains, state, now, { size: settings.reviewSize, focus: settings.reviewFocus });
  const grain = queue[0];

  return (
    <div className="screen narrow">
      <header className="screen-header">
        <h1>Review</h1>
        {grain && <span className="header-count">{queue.length} left today</span>}
      </header>
      {settings.reviewFocus && <div className="focus-note">Focused on {settings.reviewFocus}</div>}
      {grain ? (
        <ReviewCard key={grain.id} grain={grain} grains={grains} now={now} onReviewed={() => setDoneCount((n) => n + 1)} />
      ) : (
        <Empty title={doneCount ? 'Done for today' : 'Nothing to review today'}>
          <p>
            {grains.length === 0
              ? 'Grains you capture will come back here now and then, so they stay alive in your mind.'
              : doneCount
                ? `You went through ${plural(doneCount, 'grain')}. More will come back tomorrow.`
                : 'Your grains come back on their own schedule. Check back tomorrow.'}
          </p>
        </Empty>
      )}
    </div>
  );
}

function ReviewCard({ grain, grains, now, onReviewed }: { grain: Grain; grains: Grain[]; now: string; onReviewed: () => void }) {
  const [mode, setMode] = useState<'view' | 'revise' | 'retire'>('view');
  const cur = currentRevision(grain);
  const revs = revisions(grain);
  const lastTouched = grain.history[0]!;

  return (
    <article className="card review-card">
      <div className="card-meta">
        <KindBadge kind={grain.kind} />
        <span className="cat">{grain.category ?? 'Unsorted'}</span>
        {cur.confidence && <span className="confidence">{CONFIDENCE_LABEL[cur.confidence]}</span>}
      </div>
      {grain.title && <h2 className="card-title">{grain.title}</h2>}
      <RevisionBody rev={cur} />
      {grain.source && <div className="source">— {grain.source}</div>}
      <div className="card-foot muted">
        Written {longDate(createdAt(grain), now)}
        {revs.length > 1 && ` · ${plural(revs.length, 'revision')}`}
        {lastTouched.type === 'reaffirmation' && ` · last reaffirmed ${relativeDate(lastTouched.at, now)}`}
        {' · '}
        <a href={href({ name: 'grain', id: grain.id })}>History</a>
      </div>

      {mode === 'view' && (
        <div className="review-actions">
          <button
            className="button primary big"
            onClick={async () => {
              await reaffirmGrain(grain.id);
              onReviewed();
            }}
          >
            Still true
          </button>
          <button className="button big" onClick={() => setMode('revise')}>
            Revise
          </button>
          <button className="button big" onClick={() => setMode('retire')}>
            Retire
          </button>
          <button
            className="button big subtle"
            onClick={async () => {
              await skipGrain(grain.id);
              onReviewed();
            }}
          >
            Skip
          </button>
        </div>
      )}
      {mode === 'revise' && (
        <GrainEditor
          mode="revise"
          initial={{ text: cur.text, details: cur.details, confidence: cur.confidence }}
          onCancel={() => setMode('view')}
          onSave={async ({ text, details, confidence, why }) => {
            await reviseGrain(grain.id, { text, details, confidence, why }, true);
            onReviewed();
          }}
        />
      )}
      {mode === 'retire' && (
        <RetirePanel grain={grain} categories={allCategories(grains)} onCancel={() => setMode('view')} onDone={onReviewed} />
      )}
    </article>
  );
}
