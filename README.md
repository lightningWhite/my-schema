# Schema

**Turn passing tidbits into guideposts.**

Most of what we learn slips away within a couple of weeks. Schema is a place to
capture the key bits of insight, experience and learning you pick up through
life — observations, lessons, values, practices, convictions, plain practical
know-how — and to be reminded of them, so they keep shaping how you think and
decide.

Each one is a **tidbit**. Tidbits get filed, resurfaced now and then so they stay alive in your
mind, and **revised** as you learn more. Old versions are never lost, so your
schema becomes a record of how your thinking changed over time.

If you want, you can publish some tidbits. Other people can browse them and
**plant** them in their own schemas, then grow them their own way, with a link back
to where each one came from.

- **Free.** The app is a static web app on GitHub Pages and runs in your
  browser. The only server piece is a tiny sign-in helper that never sees your
  tidbits.
- **Your data lives in your own repos.** A private GitHub repo for your schema, and
  optionally a public one for what you share.
- **Works offline.** Everything is stored on your device and syncs when you're
  online.

Two styles — **Focus** (cool, crisp) and **Reflect** (warm, soft) — each in
light and dark.

> **Status: Phase 1 (sync).** Everything works on one device, and sync to a
> private GitHub repo keeps devices in step. Sharing comes next. The design is in [`docs/design.md`](docs/design.md).

## Get started

**Open the app: https://lightningwhite.github.io/my-schema/**

1. **Add it to your home screen** so it opens like an app and works offline.
   - iPhone (Safari): Share → *Add to Home Screen*.
   - Android (Chrome): ⋮ → *Add to Home screen* (or *Install app*).
2. **Add a tidbit.** Type something you've noticed, learned or come to believe,
   and press Enter. Shift+Enter adds details under it. New tidbits wait in
   **Organize** as drafts until you have a minute to file them.
3. **Back it up** (optional, recommended). Settings → **Back up & sync**:
   1. *Create my backup on GitHub*: GitHub opens with everything filled in;
      tap **Create repository**, then come back. No account? GitHub offers to
      make one first. It's free.
   2. *Connect Schema to my backup*: choose **Only select repositories**, pick
      **schema-private**, tap **Install**. You land back in the app, backed up.

   On another device, open the app and tap **Just sign in with GitHub** in the
   same place. Schema can only ever see your `schema-private` repository, and
   only you can see that.

Without backup, your tidbits live only on that device; Settings can also
export them as a zip of plain Markdown files.

## Development

```sh
npm install
npm run dev      # app at http://localhost:5173
npm test         # core unit + property tests
npm run build    # static site in dist/
```

Pushing to `main` runs the tests and deploys to GitHub Pages (set
**Settings → Pages → Source** to **GitHub Actions** once). One-time setup for
"Sign in with GitHub" (a GitHub App and a tiny Cloudflare Worker) is in
[`worker/README.md`](worker/README.md); without it, Settings offers a token
option instead.
