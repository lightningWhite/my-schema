/**
 * The real clock and ID generator, injected into core (CLAUDE.md rule 1).
 * IDs are monotonic within a session: two seeds made in the same millisecond
 * still sort in creation order.
 */
import type { Ctx } from '../core/types';
import { encodeUlid } from '../core/ulid';

export function browserCtx(): Ctx {
  let lastTime = -1;
  let lastRandom = new Uint8Array(10);
  return {
    now: () => new Date().toISOString(),
    newId: () => {
      const t = Date.now();
      if (t === lastTime) {
        // Same millisecond: increment the random part instead of re-rolling.
        const r = lastRandom.slice();
        for (let i = 9; i >= 0; i--) {
          if (r[i]! < 255) {
            r[i]!++;
            break;
          }
          r[i] = 0;
        }
        lastRandom = r;
      } else {
        lastTime = t;
        lastRandom = crypto.getRandomValues(new Uint8Array(10));
      }
      return encodeUlid(t, lastRandom);
    },
  };
}

export const ctx = browserCtx();
