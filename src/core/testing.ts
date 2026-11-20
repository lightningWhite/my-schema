/** Test helpers: a deterministic Ctx. Not imported by app code. */
import { encodeUlid } from './ulid';
import type { Ctx } from './types';

export interface TestCtx extends Ctx {
  /** Move the clock forward. */
  advance(ms: number): void;
  set(iso: string): void;
}

export function testCtx(start = '2026-01-01T00:00:00.000Z'): TestCtx {
  let t = Date.parse(start);
  let n = 0;
  return {
    now: () => new Date(t).toISOString(),
    newId: () => {
      n++;
      const bytes = new Uint8Array(10);
      bytes[9] = n & 255;
      bytes[8] = (n >> 8) & 255;
      return encodeUlid(t, bytes);
    },
    advance: (ms) => {
      t += ms;
    },
    set: (iso) => {
      t = Date.parse(iso);
    },
  };
}
