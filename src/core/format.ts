/**
 * The grain file format: `grains/<id>.md`. See docs/design.md §2.3.
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
 * History is newest first. Lines in grain text that would be mistaken for a
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
  type Grain,
  type Status,
} from './types';

export class GrainFormatError extends Error {}

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
 * Prefixes of lines that grain text may not start with as written. Escaping
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

export function serializeGrain(grain: Grain): string {
  const fm: Record<string, unknown> = {};
  fm.id = grain.id;
  if (grain.title !== undefined) fm.title = grain.title;
  if (grain.kind !== undefined) fm.kind = grain.kind;
  fm.status = grain.status;
  if (grain.category !== undefined) fm.category = grain.category;
  fm.tags = grain.tags;
  fm.links = grain.links.map((l) => ({ type: l.type, grain: l.grain }));
  fm.origin = grain.origin ? { repo: grain.origin.repo, grain: grain.origin.grain, revision: grain.origin.revision } : null;
  if (grain.source !== undefined) fm.source = grain.source;
  if (grain.retired !== undefined) {
    fm.retired = grain.retired.why === undefined ? { at: grain.retired.at } : { at: grain.retired.at, why: grain.retired.why };
  }
  fm.updated = grain.updated;
  for (const [k, v] of Object.entries(grain.extra)) {
    if (!(KNOWN_KEYS as readonly string[]).includes(k)) fm[k] = v;
  }

  const yaml = stringifyYaml(fm, { lineWidth: 0, flowCollectionPadding: false });
  let out = `---\n${yaml}---\n\n`;
  for (const entry of grain.history) {
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

export function parseGrain(file: string): Grain {
  const src = file.replace(/^﻿/, '');
  if (!src.startsWith('---\n')) throw new GrainFormatError('Missing frontmatter');
  const end = src.indexOf('\n---\n', 3);
  if (end < 0) throw new GrainFormatError('Unterminated frontmatter');
  const fmText = src.slice(4, end + 1);
  const body = src.slice(end + 5);

  const fm: unknown = parseYaml(fmText);
  if (fm === null || typeof fm !== 'object' || Array.isArray(fm)) {
    throw new GrainFormatError('Frontmatter is not a mapping');
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
        throw new GrainFormatError(`Unknown confidence: ${confidence}`);
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
        throw new GrainFormatError('A details block must follow a revision, before its why');
      }
      last.details = blockText(content);
    } else if (marker === WHY_LINE) {
      const last = history[history.length - 1];
      if (!last || last.type !== 'revision' || last.why !== undefined) {
        throw new GrainFormatError('A why block must follow a revision');
      }
      last.why = blockText(content);
    } else {
      throw new GrainFormatError(`Bad marker: ${marker}`);
    }
  }
  if (!history.some((e) => e.type === 'revision')) throw new GrainFormatError('Grain has no revisions');

  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) {
    if (!(KNOWN_KEYS as readonly string[]).includes(k)) extra[k] = v;
  }

  const grain: Grain = {
    id: str(f.id, 'id'),
    status: oneOf(f.status ?? 'active', STATUSES, 'status') as Status,
    tags: strList(f.tags, 'tags'),
    links: links(f.links),
    origin: origin(f.origin),
    updated: f.updated === undefined ? latestAt(history) : str(f.updated, 'updated'),
    history,
    extra,
  };
  if (f.title != null) grain.title = str(f.title, 'title');
  if (f.kind != null) grain.kind = oneOf(f.kind, KINDS, 'kind') as Kind;
  if (f.category != null) grain.category = str(f.category, 'category');
  if (f.source != null) grain.source = str(f.source, 'source');
  if (f.retired != null) grain.retired = retired(f.retired);
  return grain;
}

function latestAt(history: HistoryEntry[]): string {
  return history.map((e) => e.at).reduce((a, b) => (b > a ? b : a));
}

function str(v: unknown, name: string): string {
  if (typeof v !== 'string') throw new GrainFormatError(`${name} must be a string`);
  return v;
}

function oneOf(v: unknown, allowed: readonly string[], name: string): string {
  const s = str(v, name);
  if (!allowed.includes(s)) throw new GrainFormatError(`Unknown ${name}: ${s}`);
  return s;
}

function strList(v: unknown, name: string): string[] {
  if (v == null) return [];
  if (!Array.isArray(v)) throw new GrainFormatError(`${name} must be a list`);
  return v.map((x) => str(x, name));
}

function obj(v: unknown, name: string): Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new GrainFormatError(`${name} must be a mapping`);
  return v as Record<string, unknown>;
}

function links(v: unknown): Link[] {
  if (v == null) return [];
  if (!Array.isArray(v)) throw new GrainFormatError('links must be a list');
  return v.map((x) => {
    const o = obj(x, 'link');
    return { type: oneOf(o.type, LINK_TYPES, 'link type') as Link['type'], grain: str(o.grain, 'link grain') };
  });
}

function origin(v: unknown): Origin | null {
  if (v == null) return null;
  const o = obj(v, 'origin');
  return { repo: str(o.repo, 'origin.repo'), grain: str(o.grain, 'origin.grain'), revision: str(o.revision, 'origin.revision') };
}

function retired(v: unknown): Retirement {
  const o = obj(v, 'retired');
  const r: Retirement = { at: str(o.at, 'retired.at') };
  if (o.why != null) r.why = str(o.why, 'retired.why');
  return r;
}

/** Repo path of a grain's file. */
export function grainPath(id: string): string {
  return `grains/${id}.md`;
}
