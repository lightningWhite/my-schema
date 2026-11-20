/**
 * Search over a schema, used both by the Schema screen and by the capture box's
 * "you already have something like this" suggestions. Plain word matching,
 * accent- and case-insensitive; good enough for a personal schema of a few
 * thousand tidbits, and needs no index.
 */
import { currentRevision, displayTitle } from './tidbit';
import type { Tidbit } from './types';

export interface SearchHit {
  tidbit: Tidbit;
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
 * Tidbits matching every query word (prefix match on the last word, so results
 * update while typing). Title and tag matches outrank body matches.
 */
export function searchTidbits(tidbits: Tidbit[], query: string, limit = 50): SearchHit[] {
  const q = words(query);
  if (!q.length) return [];
  const last = q.length - 1;
  const hits: SearchHit[] = [];
  for (const tidbit of tidbits) {
    const title = words(displayTitle(tidbit));
    const meta = words([tidbit.category ?? '', ...tidbit.tags, tidbit.source ?? ''].join(' '));
    const cur = currentRevision(tidbit);
    const body = words(`${cur.text} ${cur.details ?? ''}`);
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
      if (tidbit.status !== 'active') score *= 0.5;
      hits.push({ tidbit, score });
    }
  }
  hits.sort((a, b) => b.score - a.score || b.tidbit.updated.localeCompare(a.tidbit.updated));
  return hits.slice(0, limit);
}

/**
 * Tidbits similar to a draft being typed: at least half of the draft's words
 * (and at least two) appear in the tidbit. Powers "already in your schema?".
 */
export function similarTidbits(tidbits: Tidbit[], draft: string, limit = 3): Tidbit[] {
  const q = [...new Set(words(draft))];
  if (q.length < 2) return searchTidbits(tidbits, draft, limit).map((h) => h.tidbit);
  const need = Math.max(2, Math.ceil(q.length / 2));
  return tidbits
    .map((tidbit) => {
      const ws = new Set(words(`${displayTitle(tidbit)} ${currentRevision(tidbit).text} ${tidbit.tags.join(' ')}`));
      const n = q.filter((w, i) => ws.has(w) || (i === q.length - 1 && [...ws].some((x) => x.startsWith(w)))).length;
      return { tidbit, n };
    })
    .filter((x) => x.n >= need)
    .sort((a, b) => b.n - a.n || b.tidbit.updated.localeCompare(a.tidbit.updated))
    .slice(0, limit)
    .map((x) => x.tidbit);
}
