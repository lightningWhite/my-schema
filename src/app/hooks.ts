import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import type { ReviewState } from '../core/review';
import type { Tidbit } from '../core/types';
import { DEFAULT_SETTINGS, type Settings } from '../store/db';
import { db } from './actions';

/** All tidbits, live. `undefined` while loading. */
export function useTidbits(): Tidbit[] | undefined {
  return useLiveQuery(() => db.tidbits.toArray(), []);
}

export function useTidbit(id: string): Tidbit | null | undefined {
  return useLiveQuery(async () => (await db.tidbits.get(id)) ?? null, [id]);
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
  | { name: 'organize' }
  | { name: 'about' }
  | { name: 'categories' }
  | { name: 'review' }
  | { name: 'schema'; category?: string; query?: string }
  | { name: 'tidbit'; id: string }
  | { name: 'settings' };

export function parseRoute(hash: string): Route {
  const [path = '', qs = ''] = hash.replace(/^#\/?/, '').split('?');
  const params = new URLSearchParams(qs);
  const [head, arg] = path.split('/');
  switch (head) {
    case 'organize':
    case 'sort': // old name
      return { name: 'organize' };
    case 'about':
      return { name: 'about' };
    case 'categories':
      return { name: 'categories' };
    case 'review':
      return { name: 'review' };
    case 'schema':
      return { name: 'schema', category: params.get('c') ?? undefined, query: params.get('q') ?? undefined };
    case 'tidbit':
    case 'grain': // old links
    case 'seed':
      return arg ? { name: 'tidbit', id: decodeURIComponent(arg) } : { name: 'schema' };
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
    case 'tidbit':
      return `#/tidbit/${encodeURIComponent(route.id)}`;
    case 'schema': {
      const p = new URLSearchParams();
      if (route.category) p.set('c', route.category);
      if (route.query) p.set('q', route.query);
      const s = p.toString();
      return `#/schema${s ? '?' + s : ''}`;
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
