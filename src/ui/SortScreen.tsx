/**
 * The Unsorted inbox: grains with no category, one at a time, oldest first.
 * Pick a category (and a kind if it has none) and it moves on to the next.
 */
import { useMemo, useState } from 'react';
import { editMeta } from '../app/actions';
import { href, useNow, useGrains } from '../app/hooks';
import { allCategories, recentCategories } from '../core/categories';
import { createdAt, currentRevision, isUnsorted } from '../core/grain';
import { cmpAt } from '../core/time';
import { relativeDate, plural } from './format';
import { CategoryPicker, Empty, KindChips, GrainText } from './parts';

export function SortScreen() {
  const grains = useGrains();
  const now = useNow();
  const [skipped, setSkipped] = useState<string[]>([]);

  const queue = useMemo(
    () =>
      (grains ?? [])
        .filter((s) => s.status === 'active' && isUnsorted(s))
        .sort((a, b) => cmpAt(createdAt(a), createdAt(b))),
    [grains],
  );
  if (!grains) return null;

  const pending = queue.filter((s) => !skipped.includes(s.id));
  const grain = pending[0];

  if (!grain) {
    return (
      <div className="screen narrow">
        <header className="screen-header">
          <h1>Sort</h1>
        </header>
        <Empty title={queue.length ? 'Nothing else to sort right now' : 'Everything is filed'}>
          {queue.length ? (
            <button className="button" onClick={() => setSkipped([])}>
              Go back to the {plural(queue.length, 'skipped grain')}
            </button>
          ) : (
            <p>New grains you don't file when you capture them land here.</p>
          )}
        </Empty>
      </div>
    );
  }

  const others = grains.filter((s) => s.id !== grain.id);
  return (
    <div className="screen narrow">
      <header className="screen-header">
        <h1>Sort</h1>
        <span className="header-count">{pending.length} left</span>
      </header>
      <article className="card sort-card" key={grain.id}>
        <div className="card-meta">
          Captured {relativeDate(createdAt(grain), now)} · <a href={href({ name: 'grain', id: grain.id })}>Open</a>
        </div>
        {grain.title && <h2 className="card-title">{grain.title}</h2>}
        <GrainText text={currentRevision(grain).text} />

        <div className="field-label">Kind</div>
        <KindChips value={grain.kind} onChange={(k) => void editMeta(grain.id, { kind: k ?? null })} />

        <div className="field-label">Category — choosing one files it</div>
        <CategoryPicker
          recent={recentCategories(others, 8)}
          all={allCategories(others)}
          onChange={(c) => {
            if (c) void editMeta(grain.id, { category: c });
          }}
        />

        <div className="card-actions">
          <button className="button" onClick={() => setSkipped((s) => [...s, grain.id])}>
            Skip for now
          </button>
        </div>
      </article>
    </div>
  );
}
