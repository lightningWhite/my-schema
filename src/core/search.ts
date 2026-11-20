/**
 * Search over a schema, used both by the Schema screen and by the capture box's
 * "you already have something like this" suggestions. Plain word matching,
 * accent- and case-insensitive; good enough for a personal schema of a few
 * thousand grains, and needs no index.
 */
import { currentRevision, displayTitle } from './grain';
import type { Grain } from './types';

export interface SearchHit {
  grain: Grain;
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
 * Grains matching every query word (prefix match on the last word, so results
 * update while typing). Title and tag matches outrank body matches.
 */
export function searchGrains(grains: Grain[], query: string, limit = 50): SearchHit[] {
  const q = words(query);
  if (!q.length) return [];
  const last = q.length - 1;
  const hits: SearchHit[] = [];
  for (const grain of grains) {
    const title = words(displayTitle(grain));
    const meta = words([grain.category ?? '', ...grain.tags, grain.source ?? ''].join(' '));
    const cur = currentRevision(grain);
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
      if (grain.status !== 'active') score *= 0.5;
      hits.push({ grain, score });
    }
  }
  hits.sort((a, b) => b.score - a.score || b.grain.updated.localeCompare(a.grain.updated));
  return hits.slice(0, limit);
}

/**
 * Grains similar to a draft being typed: at least half of the draft's words
 * (and at least two) appear in the grain. Powers "already in your schema?".
 */
export function similarGrains(grains: Grain[], draft: string, limit = 3): Grain[] {
  const q = [...new Set(words(draft))];
  if (q.length < 2) return searchGrains(grains, draft, limit).map((h) => h.grain);
  const need = Math.max(2, Math.ceil(q.length / 2));
  return grains
    .map((grain) => {
      const ws = new Set(words(`${displayTitle(grain)} ${currentRevision(grain).text} ${grain.tags.join(' ')}`));
      const n = q.filter((w, i) => ws.has(w) || (i === q.length - 1 && [...ws].some((x) => x.startsWith(w)))).length;
      return { grain, n };
    })
    .filter((x) => x.n >= need)
    .sort((a, b) => b.n - a.n || b.grain.updated.localeCompare(a.grain.updated))
    .slice(0, limit)
    .map((x) => x.grain);
}
