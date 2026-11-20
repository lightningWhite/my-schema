# Seedbank

**Keep what you've come to believe, notice, and learn — and let it grow.**

Seedbank is a place to capture the ideas that shape you: observations, lessons,
hunches, values, convictions, and plain practical know-how. Each one is a
**seed**. Seeds get filed, resurfaced now and then so they stay alive in your
mind, and **revised** as you learn more. Old versions are never lost, so your
bank becomes a record of how your thinking changed over time.

If you want, you can publish some seeds. Other people can browse them and
**plant** them in their own banks, then grow them their own way, with a link back
to where each one came from.

- **Free, with no server.** The app is a static PWA on GitHub Pages and runs in
  your browser.
- **Your data lives in your own repos.** A private GitHub repo for your bank, and
  optionally a public one for what you share.
- **Works offline.** Everything is stored on your device and syncs when you're
  online.

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
