/**
 * Passing reminders: the strip of past tidbits drifting along the top of the
 * home screen (docs/design.md §4.3). Unlike Review, nothing is asked of you and
 * nothing is recorded; a tidbit just passes by in case it catches your eye.
 *
 * Picks active tidbits at random, weighted toward ones you haven't touched in a
 * while, since those are the ones most in need of a nudge.
 */
import { cmpAt, DAY_MS } from './time';
import type { Tidbit } from './types';

/**
 * Choose up to `n` tidbits to drift past.
 * @param random returns numbers in [0, 1); injected so core stays pure.
 */
export function pickPassing(tidbits: Tidbit[], now: string, n: number, random: () => number, exclude: string[] = []): Tidbit[] {
  const pool = tidbits
    .filter((g) => g.status === 'active' && !exclude.includes(g.id))
    .map((g) => {
      const lastTouched = g.history[0]!.at;
      const days = Math.max(0, (Date.parse(now) - Date.parse(lastTouched)) / DAY_MS);
      // A week-old tidbit is ~2x as likely as a fresh one; a year-old ~4x. Never zero.
      return { g, w: 1 + Math.log2(1 + days / 7) };
    });

  // Weighted sampling without replacement (Efraimidis–Spirakis): key = u^(1/w), take the largest.
  return pool
    .map(({ g, w }) => ({ g, key: Math.pow(random() || Number.MIN_VALUE, 1 / w) }))
    .sort((a, b) => b.key - a.key || cmpAt(a.g.updated, b.g.updated))
    .slice(0, n)
    .map(({ g }) => g);
}
