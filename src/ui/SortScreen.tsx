/**
 * The Unsorted inbox: seeds with no category, one at a time, oldest first.
 * Pick a category (and a kind if it has none) and it moves on to the next.
 */
import { useMemo, useState } from 'react';
import { editMeta } from '../app/actions';
import { href, useNow, useSeeds } from '../app/hooks';
import { allCategories, recentCategories } from '../core/categories';
import { createdAt, currentRevision, isUnsorted } from '../core/seed';
import { cmpAt } from '../core/time';
import { relativeDate, plural } from './format';
import { CategoryPicker, Empty, KindChips, SeedText } from './parts';

export function SortScreen() {
  const seeds = useSeeds();
  const now = useNow();
  const [skipped, setSkipped] = useState<string[]>([]);

  const queue = useMemo(
    () =>
      (seeds ?? [])
        .filter((s) => s.status === 'active' && isUnsorted(s))
        .sort((a, b) => cmpAt(createdAt(a), createdAt(b))),
    [seeds],
  );
  if (!seeds) return null;

  const pending = queue.filter((s) => !skipped.includes(s.id));
  const seed = pending[0];

  if (!seed) {
    return (
      <div className="screen narrow">
        <header className="screen-header">
          <h1>Sort</h1>
        </header>
        <Empty title={queue.length ? 'Nothing else to sort right now' : 'Everything is filed'}>
          {queue.length ? (
            <button className="button" onClick={() => setSkipped([])}>
              Go back to the {plural(queue.length, 'skipped seed')}
            </button>
          ) : (
            <p>New seeds you don't file when you capture them land here.</p>
          )}
        </Empty>
      </div>
    );
  }

  const others = seeds.filter((s) => s.id !== seed.id);
  return (
    <div className="screen narrow">
      <header className="screen-header">
        <h1>Sort</h1>
        <span className="header-count">{pending.length} left</span>
      </header>
      <article className="card sort-card" key={seed.id}>
        <div className="card-meta">
          Captured {relativeDate(createdAt(seed), now)} · <a href={href({ name: 'seed', id: seed.id })}>Open</a>
        </div>
        {seed.title && <h2 className="card-title">{seed.title}</h2>}
        <SeedText text={currentRevision(seed).text} />

        <div className="field-label">Kind</div>
        <KindChips value={seed.kind} onChange={(k) => void editMeta(seed.id, { kind: k ?? null })} />

        <div className="field-label">Category — choosing one files it</div>
        <CategoryPicker
          recent={recentCategories(others, 8)}
          all={allCategories(others)}
          onChange={(c) => {
            if (c) void editMeta(seed.id, { category: c });
          }}
        />

        <div className="card-actions">
          <button className="button" onClick={() => setSkipped((s) => [...s, seed.id])}>
            Skip for now
          </button>
        </div>
      </article>
    </div>
  );
}
