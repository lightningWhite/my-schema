# Seedbank — Design

> **Status:** draft v0.1, written before any code. This document is the source of
> truth for intended design; when code and this doc disagree, one of them is a bug.
> Split it into numbered docs (as MACE does) once sections start growing.

---

## 1. Vision

Seedbank is a place to keep what you've come to believe, notice, and learn, and
to let it change over time.

You have an idea — an observation, a lesson, a hunch, a value you live by, a fact
about which C++ library handles a job best, what worked in the garden this year —
and you capture it in seconds. Seedbank stores it, files it, and **brings it back
to you** now and then so it stays alive in your mind. When you learn more, you
**revise** it. When you outgrow it, you let it go **dormant** or **succeed** it
with a better idea. Nothing is ever silently overwritten: the history of how your
thinking changed is part of the record, and often the most valuable part.

Taken together, a seedbank describes a person: how they see the world, what they
value, what they've learned the hard way.

**A tool first, social second.** Seedbank has to be worth using alone, on day
one, with no one else on it. The social layer — publishing some seeds, browsing
other people's, planting their seeds in your own bank and growing them your way —
is built on top of that and is entirely optional.

**Free to run, owned by the user.** The app is a static PWA on GitHub Pages. A
user's data lives in their *own* GitHub repos. There is no Seedbank server, no
account with us, no hosting bill, and nothing to shut down.

### Vocabulary

| Term | Meaning |
|---|---|
| **Seed** | One idea, belief, observation, lesson, etc. The unit of the app. |
| **Revision** | One version of a seed's text at a point in time. Seeds accumulate revisions; old ones are kept forever. |
| **Bank** | A user's collection of seeds. Physically: a GitHub repo (one private, optionally one public). |
| **Dormant** | Retired. You no longer hold it, but it stays in your bank, with a note on why. |
| **Succeeded** | Replaced by a *different* seed (a new idea, not a refinement). Points at its successor. |
| **Plant** | Copy someone else's public seed into your bank, keeping a link to where it came from. |
| **Lineage** | The chain of origins: who planted it from whom, at which revision. |
| **Review** | The resurfacing loop: a seed comes back, and you reaffirm, revise, or retire it. |

The metaphor is a guide, not a requirement. If a seed term ever makes the UI
less clear, use the plain word.

---

## 2. The seed

### 2.1 Fields

| Field | Notes |
|---|---|
| `id` | ULID — time-sortable, generated offline, globally unique without coordination. |
| `title` | Optional. Short seeds don't need one; the UI shows the first line instead. |
| `kind` | Optional. One of the kinds in §2.4. Users can't add kinds in v1 (keeps filtering meaningful); categories carry the rest. A seed with no kind is fine; the Sort screen nudges you to pick one. |
| `source` | Optional. Who or where it came from — required in spirit for a `quote` ("Marcus Aurelius, *Meditations*"), useful for a `fact` or `tip`. |
| `confidence` | Optional. `hunch` · `leaning` · `confident` · `conviction`. Lives on each revision, so you can see confidence change over time. Not shown for kinds where it makes no sense (`question`, `quote`). |
| `status` | `active` · `dormant` · `succeeded`. |
| `category` | One path in a tree, e.g. `Parenting/Discipline`, `Engineering/C++`. Created on the fly. |
| `tags` | Free-form, cross-cutting. |
| `links` | Typed links to other seeds: `related`, `supports`, `contradicts`, `succeededBy`, `succeeds`. |
| `origin` | Set when planted from someone else: `{ bank, seed, revision }`. Null for your own. |
| `revisions` | Append-only list. Each has `at`, `confidence`, `text`, and an optional `why` (why it changed). |

### 2.2 Revise vs. succeed vs. go dormant

These are deliberately different:

- **Revise** — *same idea, sharper.* "Water tomatoes deeply twice a week" →
  "…deeply twice a week, every day above 95°F." A new revision on the same seed.
- **Succeed** — *a different idea replaces it.* "Kids need firm rules first" is
  succeeded by "Kids need connection first; rules work once they feel it." A new
  seed; the old one becomes `succeeded` and links to it. Both remain browsable.
- **Dormant** — *I don't hold this anymore, and nothing replaces it.* Kept, with a
  `why`.

Nothing is ever deleted unless the user explicitly deletes a seed (and even
then, Git keeps it — see §3.6).

### 2.4 Kinds

Nine kinds. Each answers a different question about the seed, so a filter by
kind means something:

| Kind | What it is | Example |
|---|---|---|
| `idea` | Something you could make, try or do. | "A bike rack that doubles as a planter." |
| `insight` | Something you realized or learned — including lessons learned the hard way, and things you noticed. | "I argue worse when I'm hungry." |
| `belief` | Something you hold to be true about how the world works. | "Most people are doing the best they can." |
| `value` | Something you live by; a standard for your own choices. | "Leave every place better than I found it." |
| `fact` | Something checked and true, worth remembering. | "Tomatoes stop setting fruit above ~90°F." |
| `tip` | Practical know-how; how to do something well. | "Use `fmt` over `iostream` for formatting in C++." |
| `speculation` | A hunch about how things are or will turn out. | "Remote work will make small towns grow again." |
| `question` | An open question you're carrying. | "What does my son need from me that he isn't getting?" |
| `quote` | Someone else's words that stuck. Uses `source`. | "The obstacle is the way." — Marcus Aurelius |

Changes from the first draft: `observation` and `lesson` fold into `insight`
(the line between them was hard to draw at capture time); `knowhow` became
`tip`; `idea`, `fact`, `question` and `quote` are new.

Capture should never stop to ask for a kind. The app **suggests** one from the
text (a pure function in core: ends with `?` → `question`; wrapped in quotes or
has an `— Someone` attribution → `quote`; starts with "I believe/I think" →
`belief`; and so on). The suggestion is a pre-selected chip the user can
change or ignore.

### 2.5 Length

Seeds are meant to be drops, not essays, but some ideas take a paragraph to
remember what they meant. So there is **no hard limit**. Past ~500 characters
the editor shows a quiet hint ("Seeds work best short — maybe a title and a
summary first line?"). The first line is what lists show, so a long seed still
reads well in the bank.

### 2.3 File format

One Markdown file per seed: `seeds/<id>.md`. Markdown because a public bank on
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

<!-- why -->
Lost half the crop in the July heat wave on the twice-a-week schedule.

<!-- rev at=2026-11-19T15:30:00Z confidence=leaning -->
Water tomatoes deeply twice a week instead of a little every day.
```

Rules:
- Revisions are **newest first**, so GitHub's rendered view shows the current
  text at the top.
- A line beginning `<!-- rev `, `<!-- reaffirmed ` or exactly `<!-- why -->` is
  reserved. If seed text ever contains one, the writer escapes it by inserting
  a backslash after `<!-- ` (`<!-- rev ` → `<!-- \rev `); a line that already
  starts `<!-- \` gets one more backslash, so unescaping is exact.
- Optional fields (`kind`, `source`, a revision's `confidence`) are omitted
  when empty.
- Unknown frontmatter fields are **preserved** on rewrite, so newer app versions
  can add fields without older ones destroying them.
- Every bank has a `seedbank.json` manifest with a `formatVersion`. The app
  refuses to *write* to a bank whose format is newer than it understands.

**Why history lives in the file and not just in Git:** Git history is a nice
bonus (and an audit trail), but the app can't depend on it. Reading a file's
history through the GitHub API costs a request per file, and a planted seed is
a copy — its Git history doesn't come with it. Keeping revisions in the file
makes a seed self-contained and portable.

---

## 3. Storage and sync

### 3.1 Repo layout

```
seedbank.json     manifest: formatVersion, displayName, bio, visibility
index.json        GENERATED: every seed's metadata + current text, one file
seeds/<id>.md     source of truth, one per seed
review.json       resurfacing state (private bank only)
following.json    banks you follow (private bank only)
```

### 3.2 Two banks per user

GitHub sets visibility per repo, not per file, so:

- **`<user>/seedbank-private`** — private. Everything starts here.
- **`<user>/seedbank`** — public, tagged with the GitHub topic `seedbank`.
  Optional; created the first time you publish something.

**Publishing** moves a seed's file from the private bank to the public one.
When publishing, the user chooses **full history** or **current revision only**
(old revisions may be more personal than the current one). The app writes the
public copy first, then removes the private one, so a failure in the middle
leaves a duplicate, never a lost seed.

**Revising a public seed privately.** Once a seed is public, a new revision is
*not* published automatically. It is saved as a **draft revision** in the
private bank (`drafts/<id>.md`, holding only the unpublished revisions), and
the seed shows "1 unpublished revision". The user sees their own latest text
everywhere in the app; the public bank keeps the last published text. **Publish
revision** appends the draft revisions to the public file and removes the
draft, in that order. A draft never touches the public repo until then.

### 3.3 Local-first

The device holds a full copy in IndexedDB (via Dexie). The app reads and writes
locally and works fully offline; sync runs in the background when online.
IndexedDB and `index.json` are **caches** — both can be rebuilt from `seeds/`
at any time.

### 3.4 Talking to GitHub without a server

- **Auth (v1):** the user pastes a *fine-grained personal access token* scoped
  to just their two seedbank repos (Contents: read/write). The setup screen
  walks them through creating it. The token is stored on the device only.
- **Reading your own bank:** one GraphQL query fetches the whole `seeds/` tree
  with blob text, so a first sync is a single request even for hundreds of
  seeds. After that, compare blob SHAs and fetch only what changed.
- **Writing:** the Git Data API (create blobs → tree → commit → move ref) makes
  each save **one atomic commit** that updates the seed file(s) and
  `index.json` together.
- **Reading other people's public banks:** fetch their `index.json` from
  `raw.githubusercontent.com` — no token, no API rate limit, one request per bank.
- **Later:** a GitHub App plus a tiny OAuth exchange on a free Cloudflare Worker,
  so non-technical users can sign in with a button instead of a token. That
  worker would hold no user data.

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

Deleting a seed removes its file, but it stays in Git history. The UI says so
plainly. Truly erasing something from a repo means rewriting history, which is
out of scope; the honest answer is "use dormant, or don't write it down."

### 3.7 Privacy

A private repo is private from other people, not from GitHub. For seeds that
warrant more (religious, political, family), **optional client-side encryption**
(v3): a passphrase-derived key (Argon2id or PBKDF2) and AES-GCM, applied per
seed before it leaves the device. Encrypted seeds can't be published or browsed
on GitHub, and a lost passphrase means lost seeds — the UI must say so.

---

## 4. Review: bringing seeds back

Capturing ideas is easy; keeping them alive is the point. Each day the app
offers a short **review**: a handful of seeds, one at a time. For each:

- **Still true** — reaffirm. Recorded as a dated reaffirmation (cheap, no new
  revision). Pushes the next appearance further out.
- **Revise** — opens the editor; saving adds a revision.
- **Retire** — dormant (with a why) or succeed (write the replacement now).
- **Skip** — not today.

### 4.1 Scheduling

Like spaced repetition, but for reflection rather than memorization. Each seed
has an interval that grows when reaffirmed:

- Base interval by kind/confidence: `speculation`/`hunch` come back soonest;
  `value`/`conviction` come back on a slow, steady rhythm and never drop off
  entirely (values are worth revisiting *because* they feel settled).
- Reaffirm: interval × ~2.  Revise: reset to the base interval for the new
  confidence.  Skip: tomorrow-ish, with jitter.
- Daily set size is a setting (default 5). Optional focus: "this week, review
  Parenting."

Scheduling state (interval, next due date) lives in `review.json`, not in seed
files, so skipping and rescheduling don't churn seed history. Reviews are
batched into one commit.

**Reaffirmations are part of the seed's history.** "Still true" is a
meaningful signal — "I still believed this in 2029" gives a seed depth — so a
reaffirmation is written into the seed file as a one-line marker between
revisions, and the history view shows it:

```markdown
<!-- reaffirmed at=2028-03-02T14:00:00Z -->

<!-- rev at=2027-07-14T03:12:00Z confidence=confident -->
Water tomatoes deeply twice a week, and every day once it's above 95°F.
```

Reaffirmations are append-only like revisions, merge by union, and travel with
the seed when it's published with full history. Several reaffirmations in a
row collapse in the history view ("reaffirmed 4 times, last Mar 2029").

### 4.2 Reminders

A static PWA can't reliably schedule its own notifications. Plan:

1. **v1:** review is waiting when you open the app; the app badge shows a count
   where supported.
2. **Experiment:** Periodic Background Sync (Chrome on Android, installed PWAs)
   to refresh the badge or show a local notification. Unreliable by design —
   the browser decides when it runs.
3. **Later:** Web Push from the same free Cloudflare Worker on a daily cron. The
   worker only needs a push subscription and a time of day, never seed content.

---

## 5. Sharing and lineage

### 5.1 Discovery

- Public banks carry the GitHub topic `seedbank`. The Explore screen lists them
  via GitHub's repo search (`topic:seedbank`).
- Following a bank adds it to `following.json`; the app polls followed banks'
  `index.json` for new and revised seeds.
- Browsing filters: kind, category, recently revised, most planted (see §5.3).

### 5.2 Planting

Planting copies a public seed into *your* private bank as a new seed with a new
id and:

```yaml
origin:
  bank: alice/seedbank
  seed: 01JDA7Q3V2N8XK5M4R6T9WBYCE
  revision: 2027-07-14T03:12:00Z
```

From there it's yours: revise it, retire it, publish it. Its revisions start
fresh (the origin's history is one tap away via the link, not copied). If the
origin is revised later, the app can show "Alice revised the seed you planted"
— and you choose whether to take the change.

Planting unchanged is the natural "I agree" — the social signal is that you
put it in your own bank, not that you tapped a heart.

### 5.3 Lineage

- **Upstream** is easy: follow `origin` pointers, fetching each origin bank's
  `index.json`. Shown as a chain: *you ← Bob (revised) ← Alice*.
- **Downstream** ("who planted mine?") has no central server to ask. v2 answers
  it by crawling the banks the app already knows about (followed + discovered)
  and counting `origin` references. Partial, but honest about being partial.
  An exact answer would need an index service — deferred, and optional if
  ever built.

### 5.4 Not in v1

Comments, likes, notifications about other people, direct messages. Possible
later via GitHub Issues/Discussions on public banks, but the core idea is that
you respond to a seed by planting and revising it, in your own bank.

---

## 6. Architecture

Same shape as MACE's web client, without the Python: **TypeScript + React +
Vite**, a service worker for offline, deployed to GitHub Pages.

```
src/
  core/        Pure domain: seed model, revision rules, merge, review scheduler,
               file format parse/serialize, index generation. No I/O.
  store/       IndexedDB (Dexie) — local cache and outbox of pending writes.
  sync/        GitHub adapter: GraphQL read, Git Data API commit, raw fetch.
  ui/          Screens: Capture, Bank (tree + search), Seed (history view),
               Review, Explore, Settings/Setup.
  app/         Wiring: services, routing, PWA registration.
```

### 6.1 Rules

1. **`core` is pure.** No `fetch`, no IndexedDB, no `Date.now()`, no
   randomness — the clock and ID generator are passed in. Everything in it is
   unit-testable without mocks.
2. **Seed files are the source of truth.** `index.json` and IndexedDB are
   derived and must be rebuildable from `seeds/` alone.
3. **Revisions are append-only.** No code path edits or removes an existing
   revision, except explicit seed deletion.
4. **Private never leaks.** Only the explicit Publish action writes to a public
   repo. Any function that writes to the public bank takes a seed that has
   passed through publish — enforced by type, not convention.
5. **No third parties.** User data goes to the device and the user's own GitHub
   repos. No analytics, no telemetry, no fonts or scripts from CDNs.
6. **Round-trip safe.** `parse(serialize(seed)) == seed`, and unknown fields
   survive. Property-tested.

### 6.2 Screens

**Home is a single input**, like a search box: a large rounded field in the
middle of an otherwise quiet screen, focused the moment the app opens. Type,
press Enter (or the button), done.

- **After saving**, a row of quick chips slides in under the field for a few
  seconds: the suggested kind (pre-selected), your most recent categories, and
  confidence. Tap to file it, or ignore them and it stays **Unsorted**. The
  field is already clear and focused for the next seed.
- **While typing**, seeds you already have that match appear below the field
  (as a search box would). Tapping one opens it, so "I already wrote this
  down" becomes a revision instead of a duplicate. The same box is how you
  search your bank.
- **Shift+Enter / the expand button** opens the full editor for a title,
  multiple paragraphs, tags and source.

The other screens are tabs (a bottom bar on phones, a side rail on desktop),
each with a count badge where it helps:

| Tab | What it's for |
|---|---|
| **Capture** | The home input above. |
| **Sort** | The Unsorted inbox: seeds with no category (or no kind). One at a time, with the same quick chips. Swipe through them in a minute. |
| **Review** | Today's handful of seeds (§4): Still true · Revise · Retire · Skip. |
| **Bank** | Everything you have: category tree, filters by kind/status/tag, search. Opens a seed's page with its full history. |
| **Explore** | (Phase 2) Other people's public banks; plant seeds into yours. |
| **Settings** | Export/import, GitHub setup (Phase 1), review size. |

Android share-target support ("share to Seedbank" from any app) is a cheap win
later.

---

## 7. Roadmap

| Phase | Delivers | Useful because |
|---|---|---|
| **0 — Local** | PWA, capture, categories/tags, revise/dormant/succeed, history view, search, review loop. IndexedDB only, with export/import of a bank folder (zip of `.md` files). | Fully usable on one device, no GitHub needed. Proves the core loop. |
| **1 — Sync** | Private bank on GitHub via PAT, background sync, multi-device merge. | Your bank is backed up and on every device. |
| **2 — Social** | Public bank, publish (with/without history), Explore, follow, plant, upstream lineage, partial downstream. | The sharing half of the idea. |
| **3 — Polish** | Encryption, OAuth sign-in via Worker, Web Push reminders, share target, import from notes apps. | Opens it up to non-technical users. |

---

## 8. Decisions

Settled questions, kept here so the reasoning isn't lost.

1. **Category trees across banks.** A planted seed lands in **Unsorted**, with
   the origin's category shown as a one-tap suggestion.
2. **Revising a public seed.** New revisions stay private as drafts until you
   publish them (§3.2).
3. **Reaffirmations as history.** Yes — written into the seed file and shown
   in the history view (§4.1).
4. **Seed size.** Soft limit only: a hint past ~500 characters, no cap (§2.5).
5. **Kinds.** Nine kinds, suggested automatically at capture (§2.4).

## 9. Open questions

1. **Shared family bank.** A couple or family keeping a joint bank (e.g.
   parenting values) is just a repo with two collaborators — worth designing
   for explicitly? (Deferred; not yet clear how it should feel.)
2. **Name.** "Seedbank" for now; revisit if it stops fitting.
