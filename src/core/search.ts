/**
 * Search over a bank, used both by the Bank screen and by the capture box's
 * "you already have something like this" suggestions. Plain word matching,
 * accent- and case-insensitive; good enough for a personal bank of a few
 * thousand seeds, and needs no index.
 */
import { currentRevision, displayTitle } from './seed';
import type { Seed } from './types';

export interface SearchHit {
  seed: Seed;
  score: number;
}

const STOP = new Set(
  'a an and are as at be but by for from has have i if in is it its my not of on or so that the this to was we were with you your'.split(' '),
);

export function fold(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function words(s: string): string[] {
  return fold(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !STOP.has(w));
}

/**
 * Seeds matching every query word (prefix match on the last word, so results
 * update while typing). Title and tag matches outrank body matches.
 */
export function searchSeeds(seeds: Seed[], query: string, limit = 50): SearchHit[] {
  const q = words(query);
  if (!q.length) return [];
  const last = q.length - 1;
  const hits: SearchHit[] = [];
  for (const seed of seeds) {
    const title = words(displayTitle(seed));
    const meta = words([seed.category ?? '', ...seed.tags, seed.source ?? ''].join(' '));
    const body = words(currentRevision(seed).text);
    let score = 0;
    let all = true;
    for (let i = 0; i < q.length; i++) {
      const w = q[i]!;
      const m = (ws: string[]) => (i === last ? ws.some((x) => x.startsWith(w)) : ws.includes(w));
      const s = (m(title) ? 3 : 0) + (m(meta) ? 2 : 0) + (m(body) ? 1 : 0);
      if (!s) {
        all = false;
        break;
      }
      score += s;
    }
    if (all) {
      if (seed.status !== 'active') score *= 0.5;
      hits.push({ seed, score });
    }
  }
  hits.sort((a, b) => b.score - a.score || b.seed.updated.localeCompare(a.seed.updated));
  return hits.slice(0, limit);
}

/**
 * Seeds similar to a draft being typed: at least half of the draft's words
 * (and at least two) appear in the seed. Powers "already in your bank?".
 */
export function similarSeeds(seeds: Seed[], draft: string, limit = 3): Seed[] {
  const q = [...new Set(words(draft))];
  if (q.length < 2) return searchSeeds(seeds, draft, limit).map((h) => h.seed);
  const need = Math.max(2, Math.ceil(q.length / 2));
  return seeds
    .map((seed) => {
      const ws = new Set(words(`${displayTitle(seed)} ${currentRevision(seed).text} ${seed.tags.join(' ')}`));
      const n = q.filter((w, i) => ws.has(w) || (i === q.length - 1 && [...ws].some((x) => x.startsWith(w)))).length;
      return { seed, n };
    })
    .filter((x) => x.n >= need)
    .sort((a, b) => b.n - a.n || b.seed.updated.localeCompare(a.seed.updated))
    .slice(0, limit)
    .map((x) => x.seed);
}
