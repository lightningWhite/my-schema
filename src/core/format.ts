/**
 * The tidbit file format: `tidbits/<id>.md`. See docs/design.md §2.3.
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
 *   <!-- details -->
 *   longer details (optional)
 *
 *   <!-- why -->
 *   why text (optional)
 *
 * History is newest first. Lines in tidbit text that would be mistaken for a
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
  type Tidbit,
  type Status,
} from './types';

export class TidbitFormatError extends Error {}

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
 * Prefixes of lines that tidbit text may not start with as written. Escaping
 * inserts a backslash after `<!-- `; `<!-- \` is itself in the list so that
 * unescaping (remove one backslash) is exact.
 */
const ESCAPE_PREFIXES = ['<!-- rev ', '<!-- reaffirmed ', '<!-- kind ', '<!-- why', '<!-- details', '<!-- \\'];

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

export function serializeTidbit(tidbit: Tidbit): string {
  const fm: Record<string, unknown> = {};
  fm.id = tidbit.id;
  if (tidbit.title !== undefined) fm.title = tidbit.title;
  if (tidbit.kind !== undefined) fm.kind = tidbit.kind;
  fm.status = tidbit.status;
  if (tidbit.category !== undefined) fm.category = tidbit.category;
  fm.tags = tidbit.tags;
  fm.links = tidbit.links.map((l) => ({ type: l.type, tidbit: l.tidbit }));
  fm.origin = tidbit.origin ? { repo: tidbit.origin.repo, tidbit: tidbit.origin.tidbit, revision: tidbit.origin.revision } : null;
  if (tidbit.source !== undefined) fm.source = tidbit.source;
  if (tidbit.retired !== undefined) {
    fm.retired = tidbit.retired.why === undefined ? { at: tidbit.retired.at } : { at: tidbit.retired.at, why: tidbit.retired.why };
  }
  fm.updated = tidbit.updated;
  for (const [k, v] of Object.entries(tidbit.extra)) {
    if (!(KNOWN_KEYS as readonly string[]).includes(k)) fm[k] = v;
  }

  const yaml = stringifyYaml(fm, { lineWidth: 0, flowCollectionPadding: false });
  let out = `---\n${yaml}---\n\n`;
  for (const entry of tidbit.history) {
    if (entry.type === 'reaffirmation') {
      out += `<!-- reaffirmed at=${entry.at} -->\n\n`;
    } else if (entry.type === 'kindChange') {
      out += `<!-- kind at=${entry.at} from=${entry.from} to=${entry.to} -->\n\n`;
    } else {
      const conf = entry.confidence ? ` confidence=${entry.confidence}` : '';
      out += `<!-- rev at=${entry.at}${conf} -->\n${escapeText(entry.text)}\n\n`;
      if (entry.details !== undefined) out += `${DETAILS_LINE}\n${escapeText(entry.details)}\n\n`;
      if (entry.why !== undefined) out += `${WHY_LINE}\n${escapeText(entry.why)}\n\n`;
    }
  }
  return out;
}

// ---------------------------------------------------------------- parse

const REV_RE = /^<!-- rev at=(\S+)(?: confidence=(\S+))? -->$/;
const REAFFIRM_RE = /^<!-- reaffirmed at=(\S+) -->$/;
const KIND_RE = /^<!-- kind at=(\S+) from=(\S+) to=(\S+) -->$/;
const WHY_LINE = '<!-- why -->';
const DETAILS_LINE = '<!-- details -->';

function isMarker(line: string): boolean {
  return (
    line.startsWith('<!-- rev ') ||
    line.startsWith('<!-- reaffirmed ') ||
    line.startsWith('<!-- kind ') ||
    line === WHY_LINE ||
    line === DETAILS_LINE
  );
}

/** Block content ends with the blank line the writer adds; tolerate hand edits. */
function blockText(lines: string[]): string {
  const raw = lines.join('\n');
  const text = raw.endsWith('\n') ? raw.slice(0, -1) : raw.replace(/\n+$/, '');
  return unescapeText(text);
}

export function parseTidbit(file: string): Tidbit {
  const src = file.replace(/^﻿/, '');
  if (!src.startsWith('---\n')) throw new TidbitFormatError('Missing frontmatter');
  const end = src.indexOf('\n---\n', 3);
  if (end < 0) throw new TidbitFormatError('Unterminated frontmatter');
  const fmText = src.slice(4, end + 1);
  const body = src.slice(end + 5);

  const fm: unknown = parseYaml(fmText);
  if (fm === null || typeof fm !== 'object' || Array.isArray(fm)) {
    throw new TidbitFormatError('Frontmatter is not a mapping');
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
    const kind = KIND_RE.exec(marker);
    if (reaffirm) {
      history.push({ type: 'reaffirmation', at: reaffirm[1]! });
    } else if (kind) {
      history.push({
        type: 'kindChange',
        at: kind[1]!,
        from: oneOf(kind[2], KINDS, 'kind') as Kind,
        to: oneOf(kind[3], KINDS, 'kind') as Kind,
      });
    } else if (rev) {
      const confidence = rev[2];
      if (confidence !== undefined && !(CONFIDENCES as readonly string[]).includes(confidence)) {
        throw new TidbitFormatError(`Unknown confidence: ${confidence}`);
      }
      history.push({
        type: 'revision',
        at: rev[1]!,
        text: blockText(content),
        ...(confidence ? { confidence: confidence as Confidence } : {}),
      });
    } else if (marker === DETAILS_LINE) {
      const last = history[history.length - 1];
      if (!last || last.type !== 'revision' || last.details !== undefined || last.why !== undefined) {
        throw new TidbitFormatError('A details block must follow a revision, before its why');
      }
      last.details = blockText(content);
    } else if (marker === WHY_LINE) {
      const last = history[history.length - 1];
      if (!last || last.type !== 'revision' || last.why !== undefined) {
        throw new TidbitFormatError('A why block must follow a revision');
      }
      last.why = blockText(content);
    } else {
      throw new TidbitFormatError(`Bad marker: ${marker}`);
    }
  }
  if (!history.some((e) => e.type === 'revision')) throw new TidbitFormatError('Tidbit has no revisions');

  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) {
    if (!(KNOWN_KEYS as readonly string[]).includes(k)) extra[k] = v;
  }

  const tidbit: Tidbit = {
    id: str(f.id, 'id'),
    status: oneOf(f.status ?? 'active', STATUSES, 'status') as Status,
    tags: strList(f.tags, 'tags'),
    links: links(f.links),
    origin: origin(f.origin),
    updated: f.updated === undefined ? latestAt(history) : str(f.updated, 'updated'),
    history,
    extra,
  };
  if (f.title != null) tidbit.title = str(f.title, 'title');
  if (f.kind != null) tidbit.kind = oneOf(f.kind, KINDS, 'kind') as Kind;
  if (f.category != null) tidbit.category = str(f.category, 'category');
  if (f.source != null) tidbit.source = str(f.source, 'source');
  if (f.retired != null) tidbit.retired = retired(f.retired);
  return tidbit;
}

function latestAt(history: HistoryEntry[]): string {
  return history.map((e) => e.at).reduce((a, b) => (b > a ? b : a));
}

function str(v: unknown, name: string): string {
  if (typeof v !== 'string') throw new TidbitFormatError(`${name} must be a string`);
  return v;
}

function oneOf(v: unknown, allowed: readonly string[], name: string): string {
  const s = str(v, name);
  if (!allowed.includes(s)) throw new TidbitFormatError(`Unknown ${name}: ${s}`);
  return s;
}

function strList(v: unknown, name: string): string[] {
  if (v == null) return [];
  if (!Array.isArray(v)) throw new TidbitFormatError(`${name} must be a list`);
  return v.map((x) => str(x, name));
}

function obj(v: unknown, name: string): Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new TidbitFormatError(`${name} must be a mapping`);
  return v as Record<string, unknown>;
}

function links(v: unknown): Link[] {
  if (v == null) return [];
  if (!Array.isArray(v)) throw new TidbitFormatError('links must be a list');
  return v.map((x) => {
    const o = obj(x, 'link');
    return { type: oneOf(o.type, LINK_TYPES, 'link type') as Link['type'], tidbit: str(o.tidbit, 'link tidbit') };
  });
}

function origin(v: unknown): Origin | null {
  if (v == null) return null;
  const o = obj(v, 'origin');
  return { repo: str(o.repo, 'origin.repo'), tidbit: str(o.tidbit, 'origin.tidbit'), revision: str(o.revision, 'origin.revision') };
}

function retired(v: unknown): Retirement {
  const o = obj(v, 'retired');
  const r: Retirement = { at: str(o.at, 'retired.at') };
  if (o.why != null) r.why = str(o.why, 'retired.why');
  return r;
}

/** Repo path of a tidbit's file. */
export function tidbitPath(id: string): string {
  return `tidbits/${id}.md`;
}
