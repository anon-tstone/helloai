# Flipbook Studio — working notes

A web app for building multi-page flipbooks: a design canvas for laying out
pages and graphics, a page-turn reader, Cloudflare-backed storage and
publishing, and an offline export that runs from a folder with no server.

Everything lives under `flipbook/`. The repository root also holds an unrelated
AR face-filter demo from earlier work — ignore it.

## Commands

```bash
npm install
npm run db:local          # create the tables in the local D1, once
npm run build             # tsc -b && vite build  (always before wrangler dev)
npx wrangler dev --local  # whole app on http://localhost:8787

npm run dev               # editor on :5173, proxies /api to :8787
npm run dev:worker        # API on :8787   (run alongside `npm run dev`)

npm run typecheck
npm run test:e2e          # needs `wrangler dev` already running
npm run deploy            # vite build, then wrangler deploy
```

`npm run test:e2e` drives a real browser (Playwright). Set `CHROME_PATH` to
reuse an existing Chromium rather than downloading one. The last full run was
**56 checks, all passing**.

## Architecture

```
src/shared/types.ts     the document model — the contract every layer shares
src/lib/
  style.ts              APPEARANCE. One definition of how an element looks,
                        used by the React editor AND the HTML exporter
  animation.ts          entrance effects; resolves a page's sequence to real ms
  geometry.ts           rotation-aware resize, hit testing, snapping
  pageTurn.ts           drag-to-turn maths
  themes.ts             theme presets and the theme-to-theme remap
  templates.ts          page templates, built from the active theme
  factory.ts            element / page / document construction
  uploads.ts            upload plumbing shared by the panel and canvas drops
  api.ts, persistence.ts
src/store/editor.ts     editor state, history, selection, ordering, themes
src/components/         canvas, panels, reader, export dialog
src/export/
  html.ts               static HTML renderer for export
  exportBundle.ts       ZIP / single-file builds
  runtime/viewer.js     the dependency-free offline viewer
worker/index.ts         Cloudflare Worker: API + static asset serving
desktop/                Electron shell + packager for .exe / .app builds
```

### The rule that holds the whole thing together

**The editor and the exporter must render from the same definitions.** Anything
affecting how a page *looks* or *behaves* goes in `lib/style.ts`,
`lib/animation.ts` or `lib/pageTurn.ts`, and all three consumers — the editor
canvas, the in-app reader, and `export/html.ts` — read it from there. If you add
a visual property and only wire it into React, the exported book silently
diverges. That has already happened twice and both times it shipped as a bug.

`export/runtime/viewer.js` is the one deliberate exception: it is plain JS
running in the exported file, so it carries a hand-kept mirror of the
drag-to-turn maths. Change `lib/pageTurn.ts` and you must change it too — the
comments in both files say so.

### Cloudflare split

| | |
| --- | --- |
| **D1** (`DB`) | project + asset metadata: listing, ownership, publish state |
| **R2** (`BUCKET`) | document JSON and uploaded media — no size ceiling |
| **KV** (`PUBLISHED`) | published snapshots, read at the edge |

One Worker serves both the SPA (Workers Static Assets) and `/api`. Resources are
already provisioned and `wrangler.toml` points at them; ids are in
`docs/DEPLOY.md`.

Ownership is an anonymous `fb_owner` cookie. It keeps one browser's projects
away from another's and is **not authentication** — say so rather than implying
otherwise if the topic comes up.

## Conventions

- Comments explain *why*, not what. Several non-obvious decisions are already
  documented in place; keep that standard rather than narrating the code.
- Types first: extend `src/shared/types.ts`, then the resolver/renderer, then
  the UI.
- New visual features need a check in `tests/e2e.mjs` that the **exported**
  book keeps them, opened from `file://` with the network aborted. That is the
  test that catches editor/export divergence.
- Themes remap only what still matches the outgoing theme, so a hand-picked
  colour survives a theme change. Preserve that when adding themed properties.

## Traps already hit (don't reintroduce)

- Selectors that build a new array break `useSyncExternalStore` — wrap them in
  `useShallow` (see `useSelectedElements`).
- Oversized flex/grid children get "safe" alignment in Chromium and pin to the
  start edge. The book is centred explicitly with `position:absolute` + a
  translate, never `place-items: center`.
- `setPointerCapture` throws when the pointer is already gone. Every call is
  wrapped; keep it that way.
- Resetting `style.animation = ''` wipes inline animation timings. Toggle
  `animation-name` alone to restart an animation.
- A page's animation must replay when the page becomes visible, which is why
  visible pages remount on the spread change.

## State

Branch `claude/flipbook-web-system-cclsu6`, 10 commits, no pull request opened.
The repository's default branch is `claude/explore-capabilities-…`, not `main`,
so GitHub's landing page shows the AR demo rather than this project.

**Not done:** the app has never been deployed. `wrangler deploy` needs either an
interactive `wrangler login` or a `CLOUDFLARE_API_TOKEN` secret for the workflow
in `.github/workflows/deploy-flipbook.yml`. Everything else is built and tested.

## Known limits

- Text elements hold plain text with one style per element — no rich-text runs.
- Uploads are capped at 25 MB, images and MP4/WebM only.
- Font embedding in an export needs network at export time; it falls back to a
  system stack rather than failing.
- A desktop build is ~250 MB (Chromium ships inside Electron). A custom Windows
  icon built from macOS or Linux additionally needs wine.
