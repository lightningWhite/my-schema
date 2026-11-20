/**
 * The tidbit model. See docs/design.md §2.
 *
 * Everything here is plain data: JSON-serializable, no classes, no Dates.
 * Timestamps are ISO 8601 UTC strings; IDs are ULIDs.
 */

export const KINDS = [
  'idea',
  'insight',
  'belief',
  'value',
  'practice',
  'fact',
  'tip',
  'speculation',
  'question',
  'quote',
] as const;
export type Kind = (typeof KINDS)[number];

export const CONFIDENCES = ['hunch', 'leaning', 'confident', 'conviction'] as const;
export type Confidence = (typeof CONFIDENCES)[number];

/** `draft`: captured quickly, not yet looked over. Becomes `active` when marked done. */
export const STATUSES = ['draft', 'active', 'dormant', 'succeeded'] as const;
export type Status = (typeof STATUSES)[number];

export const LINK_TYPES = ['related', 'supports', 'contradicts', 'succeededBy', 'succeeds'] as const;
export type LinkType = (typeof LINK_TYPES)[number];

export interface Link {
  type: LinkType;
  tidbit: string;
}

/** Where a planted tidbit came from (§5.2). */
export interface Origin {
  repo: string;
  tidbit: string;
  revision: string;
}

/** Why and when a tidbit went dormant or was succeeded. */
export interface Retirement {
  at: string;
  why?: string;
}

export interface Revision {
  type: 'revision';
  at: string;
  /** The tidbit as written: short, the headline everywhere it is shown. */
  text: string;
  confidence?: Confidence;
  /** Optional longer explanation behind it. */
  details?: string;
  /** Why it changed from the previous revision. */
  why?: string;
}

export interface Reaffirmation {
  type: 'reaffirmation';
  at: string;
}

/** The tidbit was relabeled from one kind to another, e.g. insight → fact. */
export interface KindChange {
  type: 'kindChange';
  at: string;
  from: Kind;
  to: Kind;
}

export type HistoryEntry = Revision | Reaffirmation | KindChange;

export interface Tidbit {
  id: string;
  title?: string;
  kind?: Kind;
  status: Status;
  /** A path like `Garden/Tomatoes`. Absent means Unsorted. */
  category?: string;
  tags: string[];
  links: Link[];
  origin: Origin | null;
  source?: string;
  retired?: Retirement;
  /** When any metadata or history last changed. Tie-breaker for merges. */
  updated: string;
  /**
   * Revisions and reaffirmations, newest first. Append-only: nothing in the
   * app edits or removes an entry. Always contains at least one revision.
   */
  history: HistoryEntry[];
  /** Frontmatter fields this version of the app doesn't know. Preserved verbatim. */
  extra: Record<string, unknown>;
}

/** Injected side effects, so core stays pure (CLAUDE.md rule 1). */
export interface Ctx {
  /** Current time as an ISO 8601 UTC string. */
  now(): string;
  /** A fresh ULID. */
  newId(): string;
}
