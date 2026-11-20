/**
 * ULID encoding (https://github.com/ulid/spec). Pure: the caller supplies the
 * time and the random bytes, so the app decides where randomness comes from.
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const MAX_TIME = 2 ** 48 - 1;

/** Encode a ULID from a millisecond timestamp and 10 random bytes. */
export function encodeUlid(timeMs: number, random: Uint8Array): string {
  if (!Number.isInteger(timeMs) || timeMs < 0 || timeMs > MAX_TIME) {
    throw new RangeError(`ULID time out of range: ${timeMs}`);
  }
  if (random.length !== 10) throw new RangeError('ULID needs exactly 10 random bytes');

  let time = '';
  let t = timeMs;
  for (let i = 0; i < 10; i++) {
    time = ALPHABET[t % 32] + time;
    t = Math.floor(t / 32);
  }

  // 80 random bits → 16 base32 characters, 5 bits at a time.
  let rand = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of random) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      rand += ALPHABET[(buffer >> bits) & 31];
    }
    buffer &= (1 << bits) - 1;
  }
  return time + rand;
}

/** Milliseconds encoded in a ULID's first 10 characters. */
export function ulidTime(id: string): number {
  let t = 0;
  for (const ch of id.slice(0, 10).toUpperCase()) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) throw new Error(`Not a ULID: ${id}`);
    t = t * 32 + v;
  }
  return t;
}

export function isUlid(id: string): boolean {
  return /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(id);
}
