# Deploying Flipbook Studio to Cloudflare

The app is a single Cloudflare Worker that serves both the editor (Workers
Static Assets) and the API. It uses three Cloudflare services:

| Service | Binding | Holds |
| --- | --- | --- |
| D1 | `DB` | project + asset metadata (listing, ownership, publish state) |
| R2 | `BUCKET` | document JSON and uploaded images/video |
| KV | `PUBLISHED` | published flipbook snapshots, read at the edge |

## Resources already provisioned

These exist in the Cloudflare account this project was set up against, and
`wrangler.toml` already points at them:

| Resource | Name | Id |
| --- | --- | --- |
| D1 database | `flipbook-studio` | `afca4187-404a-4dd1-bf9b-6ab395d76757` |
| KV namespace | `flipbook-published` | `f62dac694b3e4b06ad704e24478884d5` |
| R2 bucket | `flipbook-studio-assets` | — |

The D1 schema in `schema.sql` has already been applied to that database.

## Deploy

```bash
cd flipbook
npm install
npx wrangler login     # one-time, opens a browser
npm run deploy         # builds the SPA, then uploads the Worker + assets
```

`npm run deploy` runs `vite build` first, so `dist/` is always fresh.

Wrangler prints the deployed URL, e.g. `https://flipbook-studio.<subdomain>.workers.dev`.

### Deploying from CI instead

`.github/workflows/deploy-flipbook.yml` does the same thing from GitHub Actions.
Add one repository secret and run the workflow from the Actions tab:

- `CLOUDFLARE_API_TOKEN` — an API token with **Workers Scripts: Edit**,
  **Workers KV Storage: Edit**, **Workers R2 Storage: Edit** and **D1: Edit**
  on the target account.

### Deploying to a different Cloudflare account

Create the resources, then paste the new ids into `wrangler.toml`:

```bash
npx wrangler d1 create flipbook-studio
npx wrangler kv namespace create flipbook-published
npx wrangler r2 bucket create flipbook-studio-assets
npm run db:remote          # applies schema.sql to the new D1 database
```

## Local development

Two processes, because the SPA and the Worker run separately:

```bash
npm run dev          # Vite on :5173, proxies /api to :8787
npm run dev:worker   # wrangler dev on :8787 with local D1/R2/KV
npm run db:local     # once, to create the tables in the local D1
```

Or run the production build against the real Worker runtime:

```bash
npm run build && npx wrangler dev --local
# http://localhost:8787
```

## Custom domain

Add a route in `wrangler.toml` and redeploy:

```toml
[[routes]]
pattern = "flipbook.example.com"
custom_domain = true
```

## What costs money

Everything here fits comfortably in the Cloudflare free tier for light use:
Workers requests, D1 reads/writes, KV reads and R2 storage all have free
allowances. R2 has no egress fee. Uploads are capped at 25 MB per file in
`worker/index.ts` (`MAX_UPLOAD_BYTES`).

## A note on access control

Projects are scoped by an anonymous `fb_owner` cookie, which keeps one
browser's projects private from another's. That is **not** authentication —
anyone with the cookie has the projects, and clearing it loses access to them.
Put a real identity provider (Cloudflare Access, or an auth service) in front of
`/api/projects*` before storing anything confidential. Published flipbooks at
`/v/<slug>` are intentionally public to anyone with the link.
