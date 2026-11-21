/**
 * Where a backup lives. GitHub today; Google Drive or Nextcloud could
 * implement the same interface later (docs/design.md §3.4). The sync engine
 * only ever sees paths, content ids and text.
 */

/** Path → content id (a git blob SHA, an ETag, …). Same id ⇒ same content. */
export type Listing = Map<string, string>;

export interface BackupStore {
  /** Shown in the UI: "GitHub". */
  readonly label: string;
  /** A link to the backup for people who want to look (optional). */
  readonly webUrl?: string;
  /** Every file, with a version marker for the whole backup. */
  list(): Promise<{ head: string; files: Listing }>;
  read(path: string, id: string): Promise<string>;
  /**
   * Apply all writes and deletes together, but only if the backup is still at
   * `head`. Throws StaleError if another device got there first.
   */
  write(head: string, writes: Map<string, string>, deletes: string[], message: string): Promise<{ head: string; files: Listing }>;
}

/** The backup changed since it was listed; list again and re-merge. */
export class StaleError extends Error {
  constructor() {
    super('The backup changed while syncing');
  }
}

/** The sign-in no longer works (revoked, expired). The person needs to sign in again. */
export class AuthError extends Error {}

/** Something a person can act on, in plain words. */
export class BackupError extends Error {}
