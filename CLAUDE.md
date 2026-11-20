# CLAUDE.md

Guidance for Claude Code (and other AI assistants) working in this repository.

## What this project is

Schema is a local-first PWA for capturing evolving ideas, beliefs, lessons and
observations ("tidbits"), revising them over time, resurfacing them for review, and
optionally sharing them. There is no backend: the app is static on GitHub Pages,
and each user's data lives in their own GitHub repos.

Read `docs/design.md` before making design decisions. The doc is the source of
truth for intended design.

## Non-negotiable architectural rules

1. **`src/core` is pure.** No `fetch`, IndexedDB, `Date.now()`, `Math.random()`,
   or DOM. The clock and ID generator are injected. Core is where the rules live
   (tidbit model, revisions, merge, review scheduling, file format), and it must be
   testable without mocks.
2. **Tidbit files are the source of truth.** `tidbits/<id>.md` in the user's repo.
   `index.json` and IndexedDB are derived caches and must always be rebuildable
   from `tidbits/` alone.
3. **Revisions are append-only.** Never edit or remove an existing revision. The
   only exception is the user explicitly deleting a whole tidbit.
4. **Private never leaks.** Only the explicit Publish flow may write to a public
   repo, and this is enforced by types (a `PublishedTidbit` brand), not by
   convention.
5. **No third parties.** User data goes only to the device and the user's own
   GitHub repos. No analytics, telemetry, CDN scripts, or remote fonts.
6. **Round-trip safe.** `parse(serialize(x))` must equal `x`, and unknown
   frontmatter fields must be preserved. Property-tested.
7. **Never write to a schema with a newer `formatVersion`** than the app
   understands. Reading it is fine.

## Layout

```
docs/          Design docs, read first
src/
  core/        Pure domain logic
  store/       IndexedDB (Dexie): local cache + outbox
  sync/        (Phase 1) GitHub adapter (GraphQL read, Git Data API commits, raw fetch)
  ui/          React screens
  app/         Wiring, routing, PWA registration
public/        manifest, icons, service worker
```

## Conventions

- TypeScript, `strict` on. React function components.
- Vitest for tests. Every rule in `core` gets a unit test, and the merge
  function and file format get property tests (fast-check).
- IDs are ULIDs. Timestamps are ISO 8601 UTC strings; compare them with
  `cmpAt` from `core/time.ts`, never as strings.
- `npm test` and `npm run build` (which typechecks) must pass before committing.
