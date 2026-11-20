import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import type { ReviewState } from '../core/review';
import type { Seed } from '../core/types';
import { DEFAULT_SETTINGS, type Settings } from '../store/db';
import { db } from './actions';

/** All seeds, live. `undefined` while loading. */
export function useSeeds(): Seed[] | undefined {
  return useLiveQuery(() => db.seeds.toArray(), []);
}

export function useSeed(id: string): Seed | null | undefined {
  return useLiveQuery(async () => (await db.seeds.get(id)) ?? null, [id]);
}

export function useReviewState(): ReviewState | undefined {
  return useLiveQuery(() => db.getReview(), []);
}

export function useSettings(): Settings {
  return useLiveQuery(() => db.getSettings(), []) ?? DEFAULT_SETTINGS;
}

/** The current time, refreshed every minute (so "due today" rolls over). */
export function useNow(): string {
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date().toISOString()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

// ---------------------------------------------------------------- routing

export type Route =
  | { name: 'capture' }
  | { name: 'sort' }
  | { name: 'review' }
  | { name: 'bank'; category?: string; query?: string }
  | { name: 'seed'; id: string }
  | { name: 'settings' };

export function parseRoute(hash: string): Route {
  const [path = '', qs = ''] = hash.replace(/^#\/?/, '').split('?');
  const params = new URLSearchParams(qs);
  const [head, arg] = path.split('/');
  switch (head) {
    case 'sort':
      return { name: 'sort' };
    case 'review':
      return { name: 'review' };
    case 'bank':
      return { name: 'bank', category: params.get('c') ?? undefined, query: params.get('q') ?? undefined };
    case 'seed':
      return arg ? { name: 'seed', id: decodeURIComponent(arg) } : { name: 'bank' };
    case 'settings':
      return { name: 'settings' };
    default:
      return { name: 'capture' };
  }
}

export function href(route: Route): string {
  switch (route.name) {
    case 'capture':
      return '#/';
    case 'seed':
      return `#/seed/${encodeURIComponent(route.id)}`;
    case 'bank': {
      const p = new URLSearchParams();
      if (route.category) p.set('c', route.category);
      if (route.query) p.set('q', route.query);
      const s = p.toString();
      return `#/bank${s ? '?' + s : ''}`;
    }
    default:
      return `#/${route.name}`;
  }
}

export function navigate(route: Route, replace = false): void {
  const h = href(route);
  if (replace) history.replaceState(null, '', h);
  else location.hash = h;
  if (replace) window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const on = () => setRoute(parseRoute(location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
