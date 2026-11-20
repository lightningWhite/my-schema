# Schema

**Turn passing tidbits into guideposts.**

Most of what we learn slips away within a couple of weeks. Schema is a place to
capture the key bits of insight, experience and learning you pick up through
life — observations, lessons, values, practices, convictions, plain practical
know-how — and to be reminded of them, so they keep shaping how you think and
decide.

Each one is a **grain**, as in a grain of truth. Grains get filed, resurfaced now and then so they stay alive in your
mind, and **revised** as you learn more. Old versions are never lost, so your
schema becomes a record of how your thinking changed over time.

If you want, you can publish some grains. Other people can browse them and
**plant** them in their own schemas, then grow them their own way, with a link back
to where each one came from.

- **Free, with no server.** The app is a static PWA on GitHub Pages and runs in
  your browser.
- **Your data lives in your own repos.** A private GitHub repo for your schema, and
  optionally a public one for what you share.
- **Works offline.** Everything is stored on your device and syncs when you're
  online.

Two styles — **Focus** (cool, crisp) and **Reflect** (warm, soft) — each in
light and dark.

> **Status: Phase 0 (local).** Capture, sort, review, revise / retire /
> succeed, history, search and export/import all work on one device. GitHub
> sync and sharing come next. The design is in [`docs/design.md`](docs/design.md).

## Development

```sh
npm install
npm run dev      # app at http://localhost:5173
npm test         # core unit + property tests
npm run build    # static site in dist/
```

Pushing to `main` runs the tests and deploys to GitHub Pages (set
**Settings → Pages → Source** to **GitHub Actions** once).
