import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import type { ReviewState } from '../core/review';
import type { Grain } from '../core/types';
import { DEFAULT_SETTINGS, type Settings } from '../store/db';
import { db } from './actions';

/** All grains, live. `undefined` while loading. */
export function useGrains(): Grain[] | undefined {
  return useLiveQuery(() => db.grains.toArray(), []);
}

export function useGrain(id: string): Grain | null | undefined {
  return useLiveQuery(async () => (await db.grains.get(id)) ?? null, [id]);
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
  | { name: 'review' }
  | { name: 'schema'; category?: string; query?: string }
  | { name: 'grain'; id: string }
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
    case 'review':
      return { name: 'review' };
    case 'schema':
      return { name: 'schema', category: params.get('c') ?? undefined, query: params.get('q') ?? undefined };
    case 'grain':
      return arg ? { name: 'grain', id: decodeURIComponent(arg) } : { name: 'schema' };
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
    case 'grain':
      return `#/grain/${encodeURIComponent(route.id)}`;
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
