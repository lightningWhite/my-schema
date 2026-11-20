/** Display helpers for dates and counts. */

const DAY = 86_400_000;

export function relativeDate(at: string, now: string): string {
  const d = new Date(at);
  const diff = Date.parse(now) - d.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < DAY && new Date(now).getDate() === d.getDate()) return 'today';
  if (diff < 2 * DAY) return 'yesterday';
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} days ago`;
  return longDate(at, now);
}

export function longDate(at: string, now?: string): string {
  const d = new Date(at);
  const sameYear = now && new Date(now).getFullYear() === d.getFullYear();
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

export function monthYear(at: string): string {
  return new Date(at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

export function plural(n: number, one: string, many = one + 's'): string {
  return `${n} ${n === 1 ? one : many}`;
}
