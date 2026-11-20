/**
 * Timestamp helpers. Timestamps are ISO 8601 UTC strings. Comparing them as
 * strings breaks when one has milliseconds and the other doesn't
 * (`…00Z` vs `…00.000Z`), so compare parsed values.
 */

export function cmpAt(a: string, b: string): number {
  return Date.parse(a) - Date.parse(b);
}

export function laterAt(a: string, b: string): string {
  return cmpAt(a, b) >= 0 ? a : b;
}

/** `now`, or 1 ms after `floor` if `now` isn't strictly later. */
export function strictlyAfter(now: string, floor: string): string {
  return cmpAt(now, floor) > 0 ? now : new Date(Date.parse(floor) + 1).toISOString();
}

export const DAY_MS = 86_400_000;

export function addDays(at: string, days: number): string {
  return new Date(Date.parse(at) + days * DAY_MS).toISOString();
}

/** Calendar date (UTC) of a timestamp: `2027-07-14`. */
export function dayOf(at: string): string {
  return new Date(Date.parse(at)).toISOString().slice(0, 10);
}
