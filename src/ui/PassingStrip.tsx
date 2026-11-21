/**
 * A quiet strip of past tidbits drifting along the top of the home screen.
 * Not a review: nothing to answer, nothing recorded. Pauses on hover or touch;
 * tap a tidbit to open it. Holds still for people who prefer reduced motion.
 */
import { useEffect, useMemo, useState } from 'react';
import { href } from '../app/hooks';
import { displayTitle } from '../core/tidbit';
import { KIND_INFO } from '../core/kinds';
import { pickPassing } from '../core/resurface';
import type { Tidbit } from '../core/types';

const COUNT = 12;
const MIN_TIDBITS = 3;
const SECONDS_PER_TIDBIT = 7;

export function PassingStrip({ tidbits, now, quiet, exclude }: { tidbits: Tidbit[]; now: string; quiet: boolean; exclude: string[] }) {
  // Pick once per visit to the home screen, so the strip doesn't reshuffle
  // every time a tidbit is saved or edited.
  const [ids, setIds] = useState<string[] | null>(null);
  const activeCount = tidbits.filter((g) => g.status === 'active').length;
  if (ids === null && activeCount >= MIN_TIDBITS) {
    setIds(pickPassing(tidbits, now, COUNT, Math.random, exclude).map((g) => g.id));
  }

  const items = useMemo(() => {
    const byId = new Map(tidbits.map((g) => [g.id, g]));
    return (ids ?? []).map((id) => byId.get(id)).filter((g): g is Tidbit => !!g && g.status === 'active');
  }, [ids, tidbits]);

  // Some mobile browsers scroll the page under the keyboard rather than
  // shrinking it; keep the strip pinned to the top of what's actually visible.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const update = () => root.style.setProperty('--vv-top', `${Math.max(0, vv.offsetTop)}px`);
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      root.style.removeProperty('--vv-top');
    };
  }, []);

  if (items.length < 2) return null;

  const row = (hidden: boolean) =>
    items.map((g) => (
      <a key={(hidden ? 'b' : 'a') + g.id} className="passing-item" href={href({ name: 'tidbit', id: g.id })} tabIndex={hidden ? -1 : undefined} aria-hidden={hidden || undefined}>
        {g.kind && <span className="passing-kind">{KIND_INFO[g.kind].label}</span>}
        <span className="passing-text">{truncate(displayTitle(g), 90)}</span>
      </a>
    ));

  return (
    <aside className={`passing${quiet ? ' quiet' : ''}`} aria-label="From your schema">
      {/* The row is drawn twice so the loop is seamless; the copy is hidden from screen readers. */}
      <div className="passing-track" style={{ animationDuration: `${Math.max(40, items.length * SECONDS_PER_TIDBIT)}s` }}>
        {row(false)}
        {row(true)}
      </div>
    </aside>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}
