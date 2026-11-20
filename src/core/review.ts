/**
 * Review scheduling (docs/design.md §4). Like spaced repetition, but for
 * reflection: intervals grow when a seed is reaffirmed, reset when revised,
 * and settled seeds (values, convictions) keep coming back on a slow rhythm
 * rather than dropping off.
 *
 * State lives in `review.json`, keyed by seed id. A seed with no entry is
 * scheduled from its creation date.
 */
import { createdAt, currentRevision } from './seed';
import { addDays, cmpAt, dayOf, DAY_MS } from './time';
import type { Confidence, Kind, Seed } from './types';

export interface ReviewEntry {
  /** Days until it comes back after the last review. */
  interval: number;
  /** When it's next due. */
  due: string;
  /** When it was last reviewed (any outcome). */
  last?: string;
}

export type ReviewState = Record<string, ReviewEntry>;

export type ReviewOutcome = 'reaffirmed' | 'revised' | 'skipped' | 'retired';

const CONFIDENCE_DAYS: Record<Confidence, number> = {
  hunch: 3,
  leaning: 7,
  confident: 14,
  conviction: 30,
};
const DEFAULT_DAYS = 7;

/** Kinds that should come back sooner or later than their confidence says. */
const KIND_FACTOR: Partial<Record<Kind, number>> = {
  speculation: 0.5,
  question: 0.5,
  idea: 0.75,
  fact: 1.5,
  tip: 1.5,
  quote: 1.5,
};

/** Longest gap for kinds that should never drift away. */
const SETTLED_KINDS: Kind[] = ['value', 'belief', 'practice'];
const SETTLED_MAX = 90;
const MAX_INTERVAL = 365;

export function baseInterval(kind: Kind | undefined, confidence: Confidence | undefined): number {
  const days = confidence ? CONFIDENCE_DAYS[confidence] : DEFAULT_DAYS;
  const factor = (kind && KIND_FACTOR[kind]) ?? 1;
  return Math.max(2, Math.round(days * factor));
}

export function maxInterval(kind: Kind | undefined): number {
  return kind && SETTLED_KINDS.includes(kind) ? SETTLED_MAX : MAX_INTERVAL;
}

/** The schedule for a seed, whether or not it has been reviewed yet. */
export function entryFor(seed: Seed, state: ReviewState): ReviewEntry {
  const existing = state[seed.id];
  if (existing) return existing;
  const interval = baseInterval(seed.kind, currentRevision(seed).confidence);
  return { interval, due: addDays(createdAt(seed), interval) };
}

/**
 * Update the schedule after a review.
 * @param jitter a number in [0, 1), used to spread skipped seeds out
 */
export function schedule(seed: Seed, state: ReviewState, outcome: ReviewOutcome, now: string, jitter = 0): ReviewState {
  const prev = entryFor(seed, state);
  const cap = maxInterval(seed.kind);
  let entry: ReviewEntry;
  switch (outcome) {
    case 'reaffirmed': {
      const interval = Math.min(cap, Math.max(prev.interval * 2, baseInterval(seed.kind, currentRevision(seed).confidence)));
      entry = { interval, due: addDays(now, interval), last: now };
      break;
    }
    case 'revised': {
      const interval = Math.min(cap, baseInterval(seed.kind, currentRevision(seed).confidence));
      entry = { interval, due: addDays(now, interval), last: now };
      break;
    }
    case 'skipped':
      entry = { interval: prev.interval, due: addDays(now, 1 + jitter), last: now };
      break;
    case 'retired': {
      const { [seed.id]: _removed, ...rest } = state;
      return rest;
    }
  }
  return { ...state, [seed.id]: entry };
}

export interface DailyOptions {
  /** How many seeds a day (default 5). */
  size?: number;
  /** Only seeds in this category or below it. */
  focus?: string;
}

/**
 * Today's review: active seeds that are due, most overdue first (relative to
 * their interval, so a 3-day hunch a week late beats a 90-day value a week
 * late). Seeds already reviewed today count against the day's size, so
 * finishing the review doesn't pull in more.
 */
export function dailyReview(seeds: Seed[], state: ReviewState, now: string, opts: DailyOptions = {}): Seed[] {
  const size = opts.size ?? 5;
  const today = dayOf(now);
  const doneToday = Object.values(state).filter((e) => e.last && dayOf(e.last) === today).length;
  const remaining = Math.max(0, size - doneToday);
  if (remaining === 0) return [];

  const endOfToday = `${today}T23:59:59.999Z`;
  const candidates = seeds
    .filter((s) => s.status === 'active')
    .filter((s) => !opts.focus || s.category === opts.focus || s.category?.startsWith(opts.focus + '/'))
    .map((s) => ({ seed: s, entry: entryFor(s, state) }))
    .filter(({ entry }) => cmpAt(entry.due, endOfToday) <= 0)
    .map(({ seed, entry }) => ({
      seed,
      overdue: (Date.parse(now) - Date.parse(entry.due)) / DAY_MS / entry.interval,
    }));
  candidates.sort((a, b) => b.overdue - a.overdue || a.seed.id.localeCompare(b.seed.id));
  return candidates.slice(0, remaining).map((c) => c.seed);
}

/** Number of seeds waiting in today's review (for the tab badge). */
export function dueCount(seeds: Seed[], state: ReviewState, now: string, opts: DailyOptions = {}): number {
  return dailyReview(seeds, state, now, opts).length;
}
