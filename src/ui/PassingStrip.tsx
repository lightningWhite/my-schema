/**
 * A quiet strip of past grains drifting along the bottom of the home screen.
 * Not a review: nothing to answer, nothing recorded. Pauses on hover or touch;
 * tap a grain to open it. Holds still for people who prefer reduced motion.
 */
import { useMemo, useState } from 'react';
import { href } from '../app/hooks';
import { displayTitle } from '../core/grain';
import { KIND_INFO } from '../core/kinds';
import { pickPassing } from '../core/resurface';
import type { Grain } from '../core/types';

const COUNT = 12;
const MIN_GRAINS = 3;
const SECONDS_PER_GRAIN = 7;

export function PassingStrip({ grains, now, quiet, exclude }: { grains: Grain[]; now: string; quiet: boolean; exclude: string[] }) {
  // Pick once per visit to the home screen, so the strip doesn't reshuffle
  // every time a grain is saved or edited.
  const [ids, setIds] = useState<string[] | null>(null);
  const activeCount = grains.filter((g) => g.status === 'active').length;
  if (ids === null && activeCount >= MIN_GRAINS) {
    setIds(pickPassing(grains, now, COUNT, Math.random, exclude).map((g) => g.id));
  }

  const items = useMemo(() => {
    const byId = new Map(grains.map((g) => [g.id, g]));
    return (ids ?? []).map((id) => byId.get(id)).filter((g): g is Grain => !!g && g.status === 'active');
  }, [ids, grains]);

  if (items.length < 2) return null;

  const row = (hidden: boolean) =>
    items.map((g) => (
      <a key={(hidden ? 'b' : 'a') + g.id} className="passing-item" href={href({ name: 'grain', id: g.id })} tabIndex={hidden ? -1 : undefined} aria-hidden={hidden || undefined}>
        {g.kind && <span className="passing-kind">{KIND_INFO[g.kind].label}</span>}
        <span className="passing-text">{truncate(displayTitle(g), 90)}</span>
      </a>
    ));

  return (
    <aside className={`passing${quiet ? ' quiet' : ''}`} aria-label="From your schema">
      {/* The row is drawn twice so the loop is seamless; the copy is hidden from screen readers. */}
      <div className="passing-track" style={{ animationDuration: `${Math.max(40, items.length * SECONDS_PER_GRAIN)}s` }}>
        {row(false)}
        {row(true)}
      </div>
    </aside>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}
