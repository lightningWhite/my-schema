/**
 * The seed file format: `seeds/<id>.md`. See docs/design.md §2.3.
 *
 *   ---
 *   <YAML frontmatter>
 *   ---
 *
 *   <!-- reaffirmed at=… -->
 *
 *   <!-- rev at=… confidence=… -->
 *   text
 *
 *   <!-- why -->
 *   why text
 *
 * History is newest first. Lines in seed text that would be mistaken for a
 * marker are escaped. Unknown frontmatter fields round-trip unchanged.
 */
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import {
  CONFIDENCES,
  KINDS,
  LINK_TYPES,
  STATUSES,
  type Confidence,
  type HistoryEntry,
  type Kind,
  type Link,
  type Origin,
  type Retirement,
  type Seed,
  type Status,
} from './types';

export class SeedFormatError extends Error {}

const KNOWN_KEYS = [
  'id',
  'title',
  'kind',
  'status',
  'category',
  'tags',
  'links',
  'origin',
  'source',
  'retired',
  'updated',
] as const;

// ---------------------------------------------------------------- escaping

/**
 * Prefixes of lines that seed text may not start with as written. Escaping
 * inserts a backslash after `<!-- `; `<!-- \` is itself in the list so that
 * unescaping (remove one backslash) is exact.
 */
const ESCAPE_PREFIXES = ['<!-- rev ', '<!-- reaffirmed ', '<!-- why', '<!-- \\'];

export function escapeText(text: string): string {
  return text
    .split('\n')
    .map((line) => (ESCAPE_PREFIXES.some((p) => line.startsWith(p)) ? '<!-- \\' + line.slice(5) : line))
    .join('\n');
}

export function unescapeText(text: string): string {
  return text
    .split('\n')
    .map((line) => (line.startsWith('<!-- \\') ? '<!-- ' + line.slice(6) : line))
    .join('\n');
}

// ---------------------------------------------------------------- serialize

export function serializeSeed(seed: Seed): string {
  const fm: Record<string, unknown> = {};
  fm.id = seed.id;
  if (seed.title !== undefined) fm.title = seed.title;
  if (seed.kind !== undefined) fm.kind = seed.kind;
  fm.status = seed.status;
  if (seed.category !== undefined) fm.category = seed.category;
  fm.tags = seed.tags;
  fm.links = seed.links.map((l) => ({ type: l.type, seed: l.seed }));
  fm.origin = seed.origin ? { bank: seed.origin.bank, seed: seed.origin.seed, revision: seed.origin.revision } : null;
  if (seed.source !== undefined) fm.source = seed.source;
  if (seed.retired !== undefined) {
    fm.retired = seed.retired.why === undefined ? { at: seed.retired.at } : { at: seed.retired.at, why: seed.retired.why };
  }
  fm.updated = seed.updated;
  for (const [k, v] of Object.entries(seed.extra)) {
    if (!(KNOWN_KEYS as readonly string[]).includes(k)) fm[k] = v;
  }

  const yaml = stringifyYaml(fm, { lineWidth: 0, flowCollectionPadding: false });
  let out = `---\n${yaml}---\n\n`;
  for (const entry of seed.history) {
    if (entry.type === 'reaffirmation') {
      out += `<!-- reaffirmed at=${entry.at} -->\n\n`;
    } else {
      const conf = entry.confidence ? ` confidence=${entry.confidence}` : '';
      out += `<!-- rev at=${entry.at}${conf} -->\n${escapeText(entry.text)}\n\n`;
      if (entry.why !== undefined) out += `<!-- why -->\n${escapeText(entry.why)}\n\n`;
    }
  }
  return out;
}

// ---------------------------------------------------------------- parse

const REV_RE = /^<!-- rev at=(\S+)(?: confidence=(\S+))? -->$/;
const REAFFIRM_RE = /^<!-- reaffirmed at=(\S+) -->$/;
const WHY_LINE = '<!-- why -->';

function isMarker(line: string): boolean {
  return line.startsWith('<!-- rev ') || line.startsWith('<!-- reaffirmed ') || line === WHY_LINE;
}

/** Block content ends with the blank line the writer adds; tolerate hand edits. */
function blockText(lines: string[]): string {
  const raw = lines.join('\n');
  const text = raw.endsWith('\n') ? raw.slice(0, -1) : raw.replace(/\n+$/, '');
  return unescapeText(text);
}

export function parseSeed(file: string): Seed {
  const src = file.replace(/^﻿/, '');
  if (!src.startsWith('---\n')) throw new SeedFormatError('Missing frontmatter');
  const end = src.indexOf('\n---\n', 3);
  if (end < 0) throw new SeedFormatError('Unterminated frontmatter');
  const fmText = src.slice(4, end + 1);
  const body = src.slice(end + 5);

  const fm: unknown = parseYaml(fmText);
  if (fm === null || typeof fm !== 'object' || Array.isArray(fm)) {
    throw new SeedFormatError('Frontmatter is not a mapping');
  }
  const f = fm as Record<string, unknown>;

  // History
  const lines = body.split('\n');
  if (body.endsWith('\n')) lines.pop(); // the final newline ends the last line; it doesn't start a new one
  let i = 0;
  while (i < lines.length && !isMarker(lines[i]!)) i++; // skip leading blank lines
  const history: HistoryEntry[] = [];
  while (i < lines.length) {
    const marker = lines[i]!;
    i++;
    const content: string[] = [];
    while (i < lines.length && !isMarker(lines[i]!)) content.push(lines[i++]!);

    const reaffirm = REAFFIRM_RE.exec(marker);
    const rev = REV_RE.exec(marker);
    if (reaffirm) {
      history.push({ type: 'reaffirmation', at: reaffirm[1]! });
    } else if (rev) {
      const confidence = rev[2];
      if (confidence !== undefined && !(CONFIDENCES as readonly string[]).includes(confidence)) {
        throw new SeedFormatError(`Unknown confidence: ${confidence}`);
      }
      history.push({
        type: 'revision',
        at: rev[1]!,
        text: blockText(content),
        ...(confidence ? { confidence: confidence as Confidence } : {}),
      });
    } else if (marker === WHY_LINE) {
      const last = history[history.length - 1];
      if (!last || last.type !== 'revision' || last.why !== undefined) {
        throw new SeedFormatError('A why block must follow a revision');
      }
      last.why = blockText(content);
    } else {
      throw new SeedFormatError(`Bad marker: ${marker}`);
    }
  }
  if (!history.some((e) => e.type === 'revision')) throw new SeedFormatError('Seed has no revisions');

  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) {
    if (!(KNOWN_KEYS as readonly string[]).includes(k)) extra[k] = v;
  }

  const seed: Seed = {
    id: str(f.id, 'id'),
    status: oneOf(f.status ?? 'active', STATUSES, 'status') as Status,
    tags: strList(f.tags, 'tags'),
    links: links(f.links),
    origin: origin(f.origin),
    updated: f.updated === undefined ? latestAt(history) : str(f.updated, 'updated'),
    history,
    extra,
  };
  if (f.title != null) seed.title = str(f.title, 'title');
  if (f.kind != null) seed.kind = oneOf(f.kind, KINDS, 'kind') as Kind;
  if (f.category != null) seed.category = str(f.category, 'category');
  if (f.source != null) seed.source = str(f.source, 'source');
  if (f.retired != null) seed.retired = retired(f.retired);
  return seed;
}

function latestAt(history: HistoryEntry[]): string {
  return history.map((e) => e.at).reduce((a, b) => (b > a ? b : a));
}

function str(v: unknown, name: string): string {
  if (typeof v !== 'string') throw new SeedFormatError(`${name} must be a string`);
  return v;
}

function oneOf(v: unknown, allowed: readonly string[], name: string): string {
  const s = str(v, name);
  if (!allowed.includes(s)) throw new SeedFormatError(`Unknown ${name}: ${s}`);
  return s;
}

function strList(v: unknown, name: string): string[] {
  if (v == null) return [];
  if (!Array.isArray(v)) throw new SeedFormatError(`${name} must be a list`);
  return v.map((x) => str(x, name));
}

function obj(v: unknown, name: string): Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new SeedFormatError(`${name} must be a mapping`);
  return v as Record<string, unknown>;
}

function links(v: unknown): Link[] {
  if (v == null) return [];
  if (!Array.isArray(v)) throw new SeedFormatError('links must be a list');
  return v.map((x) => {
    const o = obj(x, 'link');
    return { type: oneOf(o.type, LINK_TYPES, 'link type') as Link['type'], seed: str(o.seed, 'link seed') };
  });
}

function origin(v: unknown): Origin | null {
  if (v == null) return null;
  const o = obj(v, 'origin');
  return { bank: str(o.bank, 'origin.bank'), seed: str(o.seed, 'origin.seed'), revision: str(o.revision, 'origin.revision') };
}

function retired(v: unknown): Retirement {
  const o = obj(v, 'retired');
  const r: Retirement = { at: str(o.at, 'retired.at') };
  if (o.why != null) r.why = str(o.why, 'retired.why');
  return r;
}

/** Repo path of a seed's file. */
export function seedPath(id: string): string {
  return `seeds/${id}.md`;
}
