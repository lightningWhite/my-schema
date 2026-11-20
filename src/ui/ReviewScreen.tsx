/**
 * Today's review (docs/design.md §4): a handful of tidbits, one at a time.
 * Still true · Revise · Retire · Skip.
 */
import { useState } from 'react';
import { reaffirmTidbit, reviseTidbit, skipTidbit } from '../app/actions';
import { href, useNow, useReviewState, useTidbits, useSettings } from '../app/hooks';
import { allCategories } from '../core/categories';
import { CONFIDENCE_LABEL } from '../core/kinds';
import { dailyReview } from '../core/review';
import { createdAt, currentRevision, revisions } from '../core/tidbit';
import type { Tidbit } from '../core/types';
import { longDate, plural, relativeDate } from './format';
import { Empty, KindBadge, RevisionBody } from './parts';
import { RetirePanel } from './RetirePanel';
import { TidbitEditor } from './TidbitEditor';

export function ReviewScreen() {
  const tidbits = useTidbits();
  const state = useReviewState();
  const settings = useSettings();
  const now = useNow();
  const [doneCount, setDoneCount] = useState(0);
  if (!tidbits || !state) return null;

  const queue = dailyReview(tidbits, state, now, { size: settings.reviewSize, focus: settings.reviewFocus });
  const tidbit = queue[0];

  return (
    <div className="screen narrow">
      <header className="screen-header">
        <h1>Review</h1>
        {tidbit && <span className="header-count">{queue.length} left today</span>}
      </header>
      {settings.reviewFocus && <div className="focus-note">Focused on {settings.reviewFocus}</div>}
      {tidbit ? (
        <ReviewCard key={tidbit.id} tidbit={tidbit} tidbits={tidbits} now={now} onReviewed={() => setDoneCount((n) => n + 1)} />
      ) : (
        <Empty title={doneCount ? 'Done for today' : 'Nothing to review today'}>
          <p>
            {tidbits.length === 0
              ? 'Tidbits you capture will come back here now and then, so they stay alive in your mind.'
              : doneCount
                ? `You went through ${plural(doneCount, 'tidbit')}. More will come back tomorrow.`
                : 'Your tidbits come back on their own schedule. Check back tomorrow.'}
          </p>
        </Empty>
      )}
    </div>
  );
}

function ReviewCard({ tidbit, tidbits, now, onReviewed }: { tidbit: Tidbit; tidbits: Tidbit[]; now: string; onReviewed: () => void }) {
  const [mode, setMode] = useState<'view' | 'revise' | 'retire'>('view');
  const cur = currentRevision(tidbit);
  const revs = revisions(tidbit);
  const lastTouched = tidbit.history[0]!;

  return (
    <article className="card review-card">
      <div className="card-meta">
        <KindBadge kind={tidbit.kind} />
        <span className="cat">{tidbit.category ?? 'Unsorted'}</span>
        {cur.confidence && <span className="confidence">{CONFIDENCE_LABEL[cur.confidence]}</span>}
      </div>
      {tidbit.title && <h2 className="card-title">{tidbit.title}</h2>}
      <RevisionBody rev={cur} />
      {tidbit.source && <div className="source">— {tidbit.source}</div>}
      <div className="card-foot muted">
        Written {longDate(createdAt(tidbit), now)}
        {revs.length > 1 && ` · ${plural(revs.length, 'revision')}`}
        {lastTouched.type === 'reaffirmation' && ` · last reaffirmed ${relativeDate(lastTouched.at, now)}`}
        {' · '}
        <a href={href({ name: 'tidbit', id: tidbit.id })}>History</a>
      </div>

      {mode === 'view' && (
        <div className="review-actions">
          <button
            className="button primary big"
            onClick={async () => {
              await reaffirmTidbit(tidbit.id);
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
              await skipTidbit(tidbit.id);
              onReviewed();
            }}
          >
            Skip
          </button>
        </div>
      )}
      {mode === 'revise' && (
        <TidbitEditor
          mode="revise"
          initial={{ text: cur.text, details: cur.details, confidence: cur.confidence }}
          onCancel={() => setMode('view')}
          onSave={async ({ text, details, confidence, why }) => {
            await reviseTidbit(tidbit.id, { text, details, confidence, why }, true);
            onReviewed();
          }}
        />
      )}
      {mode === 'retire' && (
        <RetirePanel tidbit={tidbit} categories={allCategories(tidbits)} onCancel={() => setMode('view')} onDone={onReviewed} />
      )}
    </article>
  );
}
