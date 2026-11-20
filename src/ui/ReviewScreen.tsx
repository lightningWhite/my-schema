/**
 * Today's review (docs/design.md §4): a handful of seeds, one at a time.
 * Still true · Revise · Retire · Skip.
 */
import { useState } from 'react';
import { reaffirmSeed, reviseSeed, skipSeed } from '../app/actions';
import { href, useNow, useReviewState, useSeeds, useSettings } from '../app/hooks';
import { allCategories } from '../core/categories';
import { CONFIDENCE_LABEL } from '../core/kinds';
import { dailyReview } from '../core/review';
import { createdAt, currentRevision, revisions } from '../core/seed';
import type { Seed } from '../core/types';
import { longDate, plural, relativeDate } from './format';
import { Empty, KindBadge, SeedText } from './parts';
import { RetirePanel } from './RetirePanel';
import { SeedEditor } from './SeedEditor';

export function ReviewScreen() {
  const seeds = useSeeds();
  const state = useReviewState();
  const settings = useSettings();
  const now = useNow();
  const [doneCount, setDoneCount] = useState(0);
  if (!seeds || !state) return null;

  const queue = dailyReview(seeds, state, now, { size: settings.reviewSize, focus: settings.reviewFocus });
  const seed = queue[0];

  return (
    <div className="screen narrow">
      <header className="screen-header">
        <h1>Review</h1>
        {seed && <span className="header-count">{queue.length} left today</span>}
      </header>
      {settings.reviewFocus && <div className="focus-note">Focused on {settings.reviewFocus}</div>}
      {seed ? (
        <ReviewCard key={seed.id} seed={seed} seeds={seeds} now={now} onReviewed={() => setDoneCount((n) => n + 1)} />
      ) : (
        <Empty title={doneCount ? 'Done for today' : 'Nothing to review today'}>
          <p>
            {seeds.length === 0
              ? 'Seeds you capture will come back here now and then, so they stay alive in your mind.'
              : doneCount
                ? `You went through ${plural(doneCount, 'seed')}. More will come back tomorrow.`
                : 'Your seeds come back on their own schedule. Check back tomorrow.'}
          </p>
        </Empty>
      )}
    </div>
  );
}

function ReviewCard({ seed, seeds, now, onReviewed }: { seed: Seed; seeds: Seed[]; now: string; onReviewed: () => void }) {
  const [mode, setMode] = useState<'view' | 'revise' | 'retire'>('view');
  const cur = currentRevision(seed);
  const revs = revisions(seed);
  const lastTouched = seed.history[0]!;

  return (
    <article className="card review-card">
      <div className="card-meta">
        <KindBadge kind={seed.kind} />
        <span className="cat">{seed.category ?? 'Unsorted'}</span>
        {cur.confidence && <span className="confidence">{CONFIDENCE_LABEL[cur.confidence]}</span>}
      </div>
      {seed.title && <h2 className="card-title">{seed.title}</h2>}
      <SeedText text={cur.text} />
      {seed.source && <div className="source">— {seed.source}</div>}
      <div className="card-foot muted">
        Written {longDate(createdAt(seed), now)}
        {revs.length > 1 && ` · ${plural(revs.length, 'revision')}`}
        {lastTouched.type === 'reaffirmation' && ` · last reaffirmed ${relativeDate(lastTouched.at, now)}`}
        {' · '}
        <a href={href({ name: 'seed', id: seed.id })}>History</a>
      </div>

      {mode === 'view' && (
        <div className="review-actions">
          <button
            className="button primary big"
            onClick={async () => {
              await reaffirmSeed(seed.id);
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
              await skipSeed(seed.id);
              onReviewed();
            }}
          >
            Skip
          </button>
        </div>
      )}
      {mode === 'revise' && (
        <SeedEditor
          mode="revise"
          initial={{ text: cur.text, confidence: cur.confidence }}
          onCancel={() => setMode('view')}
          onSave={async ({ text, confidence, why }) => {
            await reviseSeed(seed.id, { text, confidence, why }, true);
            onReviewed();
          }}
        />
      )}
      {mode === 'retire' && (
        <RetirePanel seed={seed} categories={allCategories(seeds)} onCancel={() => setMode('view')} onDone={onReviewed} />
      )}
    </article>
  );
}
