# Schema — Design

> **Status:** v0.2, Phase 0 built. This document is the source of truth for
> intended design; when code and this doc disagree, one of them is a bug.
> Split it into numbered docs (as MACE does) once sections start growing.

---

## 1. Vision

> **Turn passing tidbits into guideposts.**

Most of what we learn slips away. We notice something true about ourselves,
pick up a lesson the hard way, hear a line that lands — and two weeks later
it's gone, and we're in the same state we were. Schema is a place to capture
those key bits of insight, experience and learning as we go through life, and
to **review and be reminded of them**, so they keep shaping how we think and
decide, for our own benefit and for the people around us.

The name carries both meanings of the word. In psychology, a *schema* is the
framework of beliefs and experience you see the world through; revising one
when experience doesn't fit is how a mind grows. In software, a schema is the
structure things conform to so they work. A personal schema is both: what
you've come to understand, written down so your decisions can line up with it.

You have an idea — an observation, a lesson, a hunch, a value you live by, a fact
about which C++ library handles a job best, what worked in the garden this year —
and you capture it in seconds. Schema stores it, files it, and **brings it back
to you** now and then so it stays alive in your mind. When you learn more, you
**revise** it. When you outgrow it, you let it go **dormant** or **succeed** it
with a better idea. Nothing is ever silently overwritten: the history of how your
thinking changed is part of the record, and often the most valuable part.

Taken together, a schema describes a person: how they see the world, what they
value, what they've learned the hard way.

**A tool first, social second.** Schema has to be worth using alone, on day
one, with no one else on it. The social layer — publishing some tidbits, browsing
other people's, planting their tidbits in your own schema and growing them your way —
is built on top of that and is entirely optional.

**Free to run, owned by the user.** The app is a static PWA on GitHub Pages. A
user's data lives in their *own* GitHub repos. There is no Schema server, no
account with us, no hosting bill, and nothing to shut down.

### Vocabulary

| Term | Meaning |
|---|---|
| **Tidbit** | One idea, belief, observation, lesson, etc. The unit of the app. |
| **Revision** | One version of a tidbit's text at a point in time. Tidbits accumulate revisions; old ones are kept forever. |
| **Schema** | A user's collection of tidbits. Physically: a GitHub repo (one private, optionally one public). |
| **Dormant** | Retired. You no longer hold it, but it stays in your schema, with a note on why. |
| **Succeeded** | Replaced by a *different* tidbit (a new idea, not a refinement). Points at its successor. |
| **Plant** | Copy someone else's public tidbit into your schema, keeping a link to where it came from. |
| **Lineage** | The chain of origins: who planted it from whom, at which revision. |
| **Review** | The resurfacing loop: a tidbit comes back, and you reaffirm, revise, or retire it. |

A **tidbit** is small on purpose: it's what you jot down in passing. The
tagline is the arc — passing tidbits become guideposts — so a ten-year-old
conviction is still called a tidbit; the name remembers where it started. If a
term ever makes the UI less clear, use the plain word.

---

## 2. The tidbit

### 2.1 Fields

| Field | Notes |
|---|---|
| `id` | ULID — time-sortable, generated offline, globally unique without coordination. |
| `title` | Legacy: superseded by the tidbit, which is revisioned (a title wouldn't be). Still read, shown and editable on tidbits that have one; new tidbits don't get one. |
| `kind` | Optional. One of the kinds in §2.4. Users can't add kinds in v1 (keeps filtering meaningful); categories carry the rest. A tidbit with no kind is fine; the Organize screen nudges you to pick one. |
| `source` | Optional. Who or where it came from — required in spirit for a `quote` ("Marcus Aurelius, *Meditations*"), useful for a `fact` or `tip`. |
| `confidence` | Optional. `hunch` · `leaning` · `confident` · `conviction`. Lives on each revision, so you can see confidence change over time. Not shown for kinds where it makes no sense (`question`, `quote`). |
| `status` | `draft` · `active` · `dormant` · `succeeded`. Quick captures start as **drafts**: kept out of Review and the passing strip until marked done in Organize. The full editor saves straight to `active`. |
| `category` | One path in a tree, e.g. `Parenting/Discipline`, `Engineering/C++`. Created on the fly. |
| `tags` | Free-form, cross-cutting. |
| `links` | Typed links to other tidbits: `related`, `supports`, `contradicts`, `succeededBy`, `succeeds`. Stored on one side only; the app reads backlinks to show both directions. |
| `origin` | Set when planted from someone else: `{ schema, tidbit, revision }`. Null for your own. |
| `revisions` | Append-only list. Each has `at`, `confidence`, `text` (the tidbit itself: short, the headline everywhere it appears), optional `details` (the longer explanation), and an optional `why` (why it changed). Tidbit and details are revised together. |

### 2.2 Revise vs. succeed vs. go dormant

These are deliberately different:

- **Revise** — *same idea, sharper.* "Water tomatoes deeply twice a week" →
  "…deeply twice a week, every day above 95°F." A new revision on the same tidbit.
- **Succeed** — *a different idea replaces it.* "Kids need firm rules first" is
  succeeded by "Kids need connection first; rules work once they feel it." A new
  tidbit; the old one becomes `succeeded` and links to it. Both remain browsable.
- **Dormant** — *I don't hold this anymore, and nothing replaces it.* Kept, with a
  `why`.

Nothing is ever deleted unless the user explicitly deletes a tidbit (and even
then, Git keeps it — see §3.6).

### 2.4 Kinds

Ten kinds. Each answers a different question about the tidbit, so a filter by
kind means something:

| Kind | What it is | Example |
|---|---|---|
| `idea` | Something you could make, try or do. | "A bike rack that doubles as a planter." |
| `insight` | Something you realized or learned — including lessons learned the hard way, and things you noticed. | "I argue worse when I'm hungry." |
| `belief` | Something you hold to be true about how the world works. | "Most people are doing the best they can." |
| `value` | Something you live by; a standard for your own choices. | "Leave every place better than I found it." |
| `practice` | Something you do, or mean to do, because it helps — a habit or personal rule. | "In bed by 10:30 on weeknights." |
| `fact` | Something checked and true, worth remembering. | "Tomatoes stop setting fruit above ~90°F." |
| `tip` | Practical know-how; how to do something well. | "Use `fmt` over `iostream` for formatting in C++." |
| `speculation` | A hunch about how things are or will turn out. | "Remote work will make small towns grow again." |
| `question` | An open question you're carrying. | "What does my son need from me that he isn't getting?" |
| `quote` | Someone else's words that stuck. Uses `source`. | "The obstacle is the way." — Marcus Aurelius |

Changes from the first draft: `observation` and `lesson` fold into `insight`
(the line between them was hard to draw at capture time); `knowhow` became
`tip`; `idea`, `fact`, `practice`, `question` and `quote` are new.

**Where common tidbits go.** A lesson learned is an `insight`. "Don't…" is not a
kind of its own: general advice for anyone is a `tip` ("Don't water in the
midday sun"), a rule for yourself is a `practice` ("No phone in the
bedroom"), and a line you won't cross on principle is a `value`.

**Practices** often grow out of an insight: "I'm happier on 8 hours of sleep"
(insight) → "In bed by 10:30" (practice). The tidbit page has **Make it a
practice**, which creates the practice with a `supports` link from the
insight, so each shows the other. A practice is reviewed like any tidbit —
"Still true" means you still believe it helps you, *not* that you kept it up.
Schema is not a habit tracker; falling short of a practice you believe in is
normal and isn't recorded as failure.

Capture should never stop to ask for a kind. The app **suggests** one from the
text (a pure function in core: ends with `?` → `question`; wrapped in quotes or
has an `— Someone` attribution → `quote`; starts with "I believe/I think" →
`belief`; and so on). The suggestion is a pre-selected chip the user can
change or ignore.

### 2.5 Tidbit and details

A tidbit is one short line — the headline, what lists and reminders show —
plus optional **details**: the context, the why, the example, whatever you'll
want to remember about it. Some ideas take a paragraph to recall what they
meant, so details have **no limit**. The tidbit gets a quiet hint past ~140
characters ("Tidbits work best short — the rest can go in the details").

At capture, Enter saves the tidbit and Shift+Enter opens the details under it.
Pasting several lines puts the first line in the tidbit and the rest in details.
Tidbits written before details existed keep their text as it was; their first
line serves as the headline.

### 2.3 File format

One Markdown file per tidbit: `tidbits/<id>.md`. Markdown because a public schema on
GitHub should be readable by a person browsing the repo, without the app.

```markdown
---
id: 01JDA7Q3V2N8XK5M4R6T9WBYCE
title: Deep watering beats frequent watering
kind: insight
status: active
category: Garden/Tomatoes
tags: [watering]
links: []
origin: null
---

<!-- rev at=2027-07-14T03:12:00Z confidence=confident -->
Water tomatoes deeply twice a week, and every day once it's above 95°F.

<!-- details -->
Deep means a slow soak to about 8 inches. In a heat wave the plants can't
pull water fast enough from dry soil, so the extra daily watering matters.

<!-- why -->
Lost half the crop in the July heat wave on the twice-a-week schedule.

<!-- rev at=2026-11-19T15:30:00Z confidence=leaning -->
Water tomatoes deeply twice a week instead of a little every day.
```

Rules:
- Revisions are **newest first**, so GitHub's rendered view shows the current
  text at the top.
- A line beginning `<!-- rev `, `<!-- reaffirmed `, or exactly `<!-- details -->`
  or `<!-- why -->`, is reserved. If tidbit text ever contains one, the writer escapes it by inserting
  a backslash after `<!-- ` (`<!-- rev ` → `<!-- \rev `); a line that already
  starts `<!-- \` gets one more backslash, so unescaping is exact.
- Within a revision the order is: tidbit, then `<!-- details -->` (optional),
  then `<!-- why -->` (optional).
- Optional fields (`kind`, `source`, a revision's `confidence` and `details`)
  are omitted when empty.
- `formatVersion` 2 added details. Version-1 files read unchanged.
- Unknown frontmatter fields are **preserved** on rewrite, so newer app versions
  can add fields without older ones destroying them.
- Every schema has a `manifest.json` manifest with a `formatVersion`. The app
  refuses to *write* to a schema whose format is newer than it understands.

**Why history lives in the file and not just in Git:** Git history is a nice
bonus (and an audit trail), but the app can't depend on it. Reading a file's
history through the GitHub API costs a request per file, and a planted tidbit is
a copy — its Git history doesn't come with it. Keeping revisions in the file
makes a tidbit self-contained and portable.

---

## 3. Storage and sync

### 3.1 Repo layout

```
manifest.json     manifest: formatVersion, displayName, bio, visibility
index.json        GENERATED: every tidbit's metadata + current text, one file
tidbits/<id>.md     source of truth, one per tidbit
review.json       resurfacing state (private schema only)
following.json    schemas you follow (private schema only)
```

### 3.2 Two schemas per user

GitHub sets visibility per repo, not per file, so:

- **`<user>/schema-private`** — private. Everything starts here.
- **`<user>/schema`** — public, tagged with the GitHub topic `personal-schema`.
  Optional; created the first time you publish something.

**Publishing** moves a tidbit's file from the private schema to the public one.
When publishing, the user chooses **full history** or **current revision only**
(old revisions may be more personal than the current one). The app writes the
public copy first, then removes the private one, so a failure in the middle
leaves a duplicate, never a lost tidbit.

**Revising a public tidbit privately.** Once a tidbit is public, a new revision is
*not* published automatically. It is saved as a **draft revision** in the
private schema (`drafts/<id>.md`, holding only the unpublished revisions), and
the tidbit shows "1 unpublished revision". The user sees their own latest text
everywhere in the app; the public schema keeps the last published text. **Publish
revision** appends the draft revisions to the public file and removes the
draft, in that order. A draft never touches the public repo until then.

### 3.3 Local-first

The device holds a full copy in IndexedDB (via Dexie). The app reads and writes
locally and works fully offline; sync runs in the background when online.
IndexedDB and `index.json` are **caches** — both can be rebuilt from `tidbits/`
at any time.

### 3.4 Talking to GitHub without a server

**Goal: easy enough for anyone's grandmother.** Creating a free GitHub account
is the one real step. After that, backup is one button and then invisible. The
words "repository", "token", "commit" and "branch" never appear in the normal
flow; the UI says "your private backup on GitHub".

**Sign in (default): the Schema GitHub App, limited to one repository.**
First time, Settings → *Back up & sync* shows two steps:

1. **Create your private backup** — opens GitHub's new-repository page
   pre-filled (`name=schema-private`, `visibility=private`); the person taps
   *Create repository* and comes back. People without an account are offered
   sign-up first.
2. **Let Schema use it** — opens the app's install page; the person picks
   *Only select repositories* → `schema-private` → *Install*. Because the app
   requests user authorization during installation, GitHub then signs them in
   and returns them to the app, which connects and syncs.

Another device: **Just sign in with GitHub** (OAuth web flow with PKCE).

- Why a GitHub App: permissions are per repository (*Contents: read & write*
  on `schema-private`, nothing else). A classic OAuth App's `repo` scope would
  grant full control of every repository the person can reach — and if the
  app itself were ever compromised (a poisoned dependency, a hijacked
  account), every user's whole GitHub would be exposed. With the GitHub App,
  the worst case is one person's tidbit backup. The cost is two screens on
  GitHub instead of one, once.
- Why the person creates the repo: GitHub Apps can't reliably create a repo in
  a personal account. A repo created on github.com starts empty, and the Git
  Data API refuses empty repos, so on connecting the app adds a README through
  the Contents API first.
- GitHub's sign-in still requires a client secret, and its token endpoint
  doesn't accept browser (CORS) requests, so a pure static page can't finish
  sign-in alone. A **tiny Cloudflare Worker** (`worker/`, free tier) does only
  the code→token exchange: it holds the client secret, allows only the app's
  origin, stores and logs nothing, and never sees tidbits.
- User tokens are set not to expire, so nobody gets signed out unexpectedly.
  The token lives only on the device (IndexedDB). *Sign out of this device*
  forgets it; uninstalling the app on GitHub revokes it everywhere.
- If the repo is missing or not shared, connecting says so in plain words and
  the two steps stay on screen.

**Token (advanced).** For developers, or before the Worker is deployed: paste
a fine-grained personal access token (Contents and Administration read/write,
so the app can create the repo; or Contents only on an existing
`schema-private` repo).

**Sync model.** State-based, not an outbox: each sync compares three
versions of every file — this device, GitHub, and the **base** (what both
agreed on at the last sync, stored locally) — and merges them with the core
merge function (§3.5):

- On both sides → three-way merge; upload if the result differs from GitHub.
- Only here → new here (upload), or deleted on GitHub: deleted here too
  unless it was edited here since (an edit beats a delete).
- Only on GitHub → new there (download), or deleted here: deleted on GitHub
  too unless it was edited there since.

Reading: one tree listing per sync; only files whose blob SHA changed since
the base are downloaded. Writing: one commit per sync (Git Data API: tree with
inline contents → commit → move the branch ref with `force: false`). If
another device moved the branch first, the sync starts over and merges again.
`index.json` is regenerated in the same commit. `review.json` merges per
tidbit (the most recently reviewed entry wins). A schema with a newer
`formatVersion` is read but never written, and the app says to update.

**When it syncs:** on open, when the device comes back online, when the app
returns to the foreground, a few seconds after any change, and every few
minutes while open. Sync never blocks the UI and never loses local work: the
remote commit happens first, and local changes made mid-sync are merged on
the next pass.

- **Reading other people's public schemas:** fetch their `index.json` from
  `raw.githubusercontent.com` — no token, no API rate limit, one request per schema.

**Other backup services (later).** The sync engine talks to a small
`BackupStore` interface (`src/sync/store.ts`): list files with content ids,
read one, and write a batch only if nothing changed since listing. GitHub is
the first implementation. **Google Drive** (the app-data folder, `drive.appdata`
scope, which Google lets browser apps use without a server) and **Nextcloud**
(WebDAV with an app password, where the server allows cross-origin requests)
could implement the same interface for people who want backup without GitHub.
They can't do atomic multi-file writes, so they'd use per-file conditional
writes (ETags) instead. Sharing (§5) still needs a public GitHub repo, so
choosing another backup simply means not sharing — or adding GitHub later
just for that.

### 3.5 Conflicts

Two devices edit offline, then both sync. Because revisions are append-only and
keyed by timestamp, most conflicts merge mechanically:

- Revisions: union, sorted by `at`.
- Metadata (title, category, tags, status): last-writer-wins per field, by the
  timestamp of the change.
- The commit uses the expected parent SHA; if the ref has moved
  (non-fast-forward), the app re-fetches, merges, and retries.

The merge function is pure and lives in the core — easy to test exhaustively.

### 3.6 Deletion

Deleting a tidbit removes its file, but it stays in Git history. The UI says so
plainly. Truly erasing something from a repo means rewriting history, which is
out of scope; the honest answer is "use dormant, or don't write it down."

### 3.7 Privacy

A private repo is private from other people, not from GitHub. For tidbits that
warrant more (religious, political, family), **optional client-side encryption**
(v3): a passphrase-derived key (Argon2id or PBKDF2) and AES-GCM, applied per
tidbit before it leaves the device. Encrypted tidbits can't be published or browsed
on GitHub, and a lost passphrase means lost tidbits — the UI must say so.

---

## 4. Review: bringing tidbits back

Capturing ideas is easy; keeping them alive is the point. Each day the app
offers a short **review**: a handful of tidbits, one at a time. For each:

- **Still true** — reaffirm. Recorded as a dated reaffirmation (cheap, no new
  revision). Pushes the next appearance further out.
- **Revise** — opens the editor; saving adds a revision.
- **Retire** — dormant (with a why) or succeed (write the replacement now).
- **Skip** — not today.

### 4.1 Scheduling

Like spaced repetition, but for reflection rather than memorization. Each tidbit
has an interval that grows when reaffirmed:

- Base interval by kind/confidence: `speculation`/`hunch` come back soonest;
  `value`/`conviction` come back on a slow, steady rhythm and never drop off
  entirely (values are worth revisiting *because* they feel settled).
- Reaffirm: interval × ~2.  Revise: reset to the base interval for the new
  confidence.  Skip: tomorrow-ish, with jitter.
- Daily set size is a setting (default 5). Optional focus: "this week, review
  Parenting."

Scheduling state (interval, next due date) lives in `review.json`, not in tidbit
files, so skipping and rescheduling don't churn tidbit history. Reviews are
batched into one commit.

**Reaffirmations are part of the tidbit's history.** "Still true" is a
meaningful signal — "I still believed this in 2029" gives a tidbit depth — so a
reaffirmation is written into the tidbit file as a one-line marker between
revisions, and the history view shows it:

```markdown
<!-- reaffirmed at=2028-03-02T14:00:00Z -->

<!-- rev at=2027-07-14T03:12:00Z confidence=confident -->
Water tomatoes deeply twice a week, and every day once it's above 95°F.
```

Reaffirmations are append-only like revisions, merge by union, and travel with
the tidbit when it's published with full history.

**Kind changes are history too.** Noticing something (insight) and later
learning it's a fact is a change in what the tidbit *is*, so moving from one
kind to another writes a marker, shown in the timeline as "Insight → Fact":

```markdown
<!-- kind at=2028-05-01T09:00:00Z from=insight to=fact -->
```

Choosing a first kind, or relabeling a draft, is just filing and isn't
recorded. Category, tags and source are labels and change in place. Several reaffirmations in a
row collapse in the history view ("reaffirmed 4 times, last Mar 2029").

### 4.2 Reminders

A static PWA can't reliably schedule its own notifications. Plan:

1. **v1:** review is waiting when you open the app; the app badge shows a count
   where supported.
2. **Experiment:** Periodic Background Sync (Chrome on Android, installed PWAs)
   to refresh the badge or show a local notification. Unreliable by design —
   the browser decides when it runs.
3. **Later:** Web Push from the same free Cloudflare Worker on a daily cron. The
   worker only needs a push subscription and a time of day, never tidbit content.


### 4.3 In passing

Review is deliberate; some reminding should be effortless. Along the top of
the home screen, a thin strip of past tidbits drifts slowly by, in case one
catches your eye while you're there to capture something new. Nothing is
asked and nothing is recorded — it is not a review.

- Active tidbits only, picked at random but weighted toward ones you haven't
  touched in a while (pure function in core, randomness injected).
- Picked once per visit, so it doesn't reshuffle as you save.
- Quiet by design: low contrast, fades a little while you type, and sits at the top of the screen so it stays visible above the keyboard, pauses on hover
  or touch, tap a tidbit to open it. Holds still (scroll by hand) when the
  device asks for reduced motion. Hidden until there are at least three tidbits.

---

## 5. Sharing and lineage

### 5.1 Discovery

- Public schemas carry the GitHub topic `personal-schema`. The Explore screen lists them
  via GitHub's repo search (`topic:personal-schema`).
- Following a schema adds it to `following.json`; the app polls followed schemas'
  `index.json` for new and revised tidbits.
- Browsing filters: kind, category, recently revised, most planted (see §5.3).

### 5.2 Planting

Planting copies a public tidbit into *your* private schema as a new tidbit with a new
id and:

```yaml
origin:
  repo: alice/schema
  tidbit: 01JDA7Q3V2N8XK5M4R6T9WBYCE
  revision: 2027-07-14T03:12:00Z
```

From there it's yours: revise it, retire it, publish it. Its revisions start
fresh (the origin's history is one tap away via the link, not copied). If the
origin is revised later, the app can show "Alice revised the tidbit you planted"
— and you choose whether to take the change.

Planting unchanged is the natural "I agree" — the social signal is that you
put it in your own schema, not that you tapped a heart.

### 5.3 Lineage

- **Upstream** is easy: follow `origin` pointers, fetching each origin schema's
  `index.json`. Shown as a chain: *you ← Bob (revised) ← Alice*.
- **Downstream** ("who planted mine?") has no central server to ask. v2 answers
  it by crawling the schemas the app already knows about (followed + discovered)
  and counting `origin` references. Partial, but honest about being partial.
  An exact answer would need an index service — deferred, and optional if
  ever built.

### 5.4 Not in v1

Comments, likes, notifications about other people, direct messages. Possible
later via GitHub Issues/Discussions on public schemas, but the core idea is that
you respond to a tidbit by planting and revising it, in your own schema.

---

## 6. Architecture

Same shape as MACE's web client, without the Python: **TypeScript + React +
Vite**, a service worker for offline, deployed to GitHub Pages.

```
src/
  core/        Pure domain: tidbit model, revision rules, merge, review scheduler,
               file format parse/serialize, index generation. No I/O.
  store/       IndexedDB (Dexie) — local cache and outbox of pending writes.
  sync/        GitHub adapter: GraphQL read, Git Data API commit, raw fetch.
  ui/          Screens: Capture, Schema (tree + search), Tidbit (history view),
               Review, Explore, Settings/Setup.
  app/         Wiring: services, routing, PWA registration.
```

### 6.1 Rules

1. **`core` is pure.** No `fetch`, no IndexedDB, no `Date.now()`, no
   randomness — the clock and ID generator are passed in. Everything in it is
   unit-testable without mocks.
2. **Tidbit files are the source of truth.** `index.json` and IndexedDB are
   derived and must be rebuildable from `tidbits/` alone.
3. **Revisions are append-only.** No code path edits or removes an existing
   revision, except explicit tidbit deletion.
4. **Private never leaks.** Only the explicit Publish action writes to a public
   repo. Any function that writes to the public schema takes a tidbit that has
   passed through publish — enforced by type, not convention.
5. **No third parties.** User data goes to the device and the user's own GitHub
   repos. No analytics, no telemetry, no fonts or scripts from CDNs.
6. **Round-trip safe.** `parse(serialize(tidbit)) == tidbit`, and unknown fields
   survive. Property-tested.

### 6.2 Screens

**Home is a single input**, like a search box: a large rounded field in the
middle of an otherwise quiet screen, focused the moment the app opens. Type,
press Enter (or the button), done.

- **After saving**, a row of quick chips slides in under the field for a few
  seconds: the suggested kind (pre-selected), your most recent categories, and
  confidence. Tap to file it, or ignore them and it stays **Unsorted**. The
  field is already clear and focused for the next tidbit.
- **While typing**, tidbits you already have that match appear below the field
  (as a search box would). Tapping one opens it, so "I already wrote this
  down" becomes a revision instead of a duplicate. The same box is how you
  search your schema.
- **Shift+Enter / the expand button** opens the full editor for a title,
  multiple paragraphs, tags and source.

The other screens are tabs (a bottom bar on phones, a side rail on desktop),
each with a count badge where it helps:

| Tab | What it's for |
|---|---|
| **Capture** | The home input above. |
| **Organize** | Drafts, one at a time, oldest first: tidy the wording or add details, set kind, category and confidence, then **Done** (or **Skip**, or **Discard**). Tidbits without a category are a filter in the Schema tab. |
| **Review** | Today's handful of tidbits (§4): Still true · Revise · Retire · Skip. |
| **Schema** | Everything you have: category tree, filters by kind/status/tag, search. Opens a tidbit's page with its full history. |
| **Explore** | (Phase 2) Other people's public schemas; plant tidbits into yours. |
| **Settings** | Style, export/import, GitHub setup (Phase 1), review size. |

An **About** page, linked under the capture box on the home screen and from
Settings, explains the idea in plain words: why, what a schema is, how the
loop works, the kinds, and where your data lives.

### 6.3 Two styles

People come to this from different directions — some think in systems and
evidence, some journal and reflect — so the app has two **styles**, chosen in
Settings, each in light and dark:

- **Focus** (default): cool slate and teal, crisp corners, monospace metadata,
  denser layout.
- **Reflect**: warm paper tones, serif text, soft rounded shapes, more air.

Style and **appearance** (System · Light · Dark) are independent settings.
They are per-device preferences, kept in `localStorage` and applied before
first paint, not stored in the schema. Both styles share every feature and
every word; only the look changes.

The logo is a small graph of linked nodes on an accent tile: a schema as a
network of connected tidbits.

Android share-target support ("share to Schema" from any app) is a cheap win
later.

---

## 7. Roadmap

| Phase | Delivers | Useful because |
|---|---|---|
| **0 — Local** | PWA, capture, categories/tags, revise/dormant/succeed, history view, search, review loop. IndexedDB only, with export/import of a schema folder (zip of `.md` files). | Fully usable on one device, no GitHub needed. Proves the core loop. |
| **1 — Sync** | Private schema on GitHub via the Schema GitHub App (one repo only; tiny Worker for sign-in) or a token; background sync; multi-device merge. | Your schema is backed up and on every device. |
| **2 — Social** | Public schema, publish (with/without history), Explore, follow, plant, upstream lineage, partial downstream. | The sharing half of the idea. |
| **3 — Polish** | Encryption, Web Push reminders, share target, import from notes apps. | Opens it up to non-technical users. |

---

## 8. Decisions

Settled questions, kept here so the reasoning isn't lost.

1. **Category trees across schemas.** A planted tidbit lands in **Unsorted**, with
   the origin's category shown as a one-tap suggestion.
2. **Revising a public tidbit.** New revisions stay private as drafts until you
   publish them (§3.2).
3. **Reaffirmations as history.** Yes — written into the tidbit file and shown
   in the history view (§4.1).
4. **Tidbit size.** Soft limit only: a hint past ~500 characters, no cap (§2.5).
5. **Kinds.** Ten kinds, suggested automatically at capture (§2.4). Practices
   are reviewed for belief, not adherence — no "did you do it?" tracking.
6. **Name.** The app is **Schema** (formerly Seedbank); one entry is a
   **tidbit** (briefly called a *grain*; one word for the entry and the
   thing you type proved clearer than two). Importing still accepts the old
   `seeds/` + `seedbank.json` and `grains/` layouts, and the on-device
   database keeps its old name so no data is lost.

## 9. Open questions

1. **Shared family schema.** A couple or family keeping a joint schema (e.g.
   parenting values) is just a repo with two collaborators — worth designing
   for explicitly? (Deferred; not yet clear how it should feel.)
2. **Discoverability.** "Schema" is a crowded word in search, especially among
   developer tools. Fine for now; if it grows, use "Personal Schema" in app
   stores and search while the app itself just says Schema.
