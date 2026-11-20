/**
 * The grain model. See docs/design.md §2.
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

export const STATUSES = ['active', 'dormant', 'succeeded'] as const;
export type Status = (typeof STATUSES)[number];

export const LINK_TYPES = ['related', 'supports', 'contradicts', 'succeededBy', 'succeeds'] as const;
export type LinkType = (typeof LINK_TYPES)[number];

export interface Link {
  type: LinkType;
  grain: string;
}

/** Where a planted grain came from (§5.2). */
export interface Origin {
  repo: string;
  grain: string;
  revision: string;
}

/** Why and when a grain went dormant or was succeeded. */
export interface Retirement {
  at: string;
  why?: string;
}

export interface Revision {
  type: 'revision';
  at: string;
  /** The tidbit itself: short, the headline everywhere the grain is shown. */
  text: string;
  confidence?: Confidence;
  /** Optional longer explanation behind the tidbit in `text`. */
  details?: string;
  /** Why it changed from the previous revision. */
  why?: string;
}

export interface Reaffirmation {
  type: 'reaffirmation';
  at: string;
}

export type HistoryEntry = Revision | Reaffirmation;

export interface Grain {
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
