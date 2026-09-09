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

`.github/workflows/deploy-flipbook.yml` does the same thing from GitHub Actions,
with no local install and without the token ever leaving GitHub.

1. Create the token at **dash.cloudflare.com → My Profile → API Tokens →
   Create Token**. The **Edit Cloudflare Workers** template covers it; otherwise
   grant **Workers Scripts: Edit**, **Workers KV Storage: Edit**,
   **Workers R2 Storage: Edit** and **D1: Edit** on the target account.
2. Add it as the repository secret `CLOUDFLARE_API_TOKEN`
   (**Settings → Secrets and variables → Actions**). Add
   `CLOUDFLARE_ACCOUNT_ID` too if the token can reach more than one account.
3. Push to the feature branch, or run the workflow from the Actions tab once
   this file is on the default branch — GitHub only offers manual dispatch for
   workflows that exist there.

Until the secret exists the workflow still runs: it builds the app to prove the
branch compiles, then reports that it skipped the deploy rather than failing.

### Why deployment cannot be automated from the Cloudflare MCP server

The Cloudflare MCP server can create the storage resources this project needs
(`d1_database_create`, `kv_namespace_create`, `r2_bucket_create`), which is how
the D1 database, KV namespace and R2 bucket here were made. It exposes no tool
that uploads a Worker script — `workers_list`, `workers_get_worker` and
`workers_get_worker_code` are read-only. Granting the OAuth app *Workers Write*
does not change that: the scope governs what the token may do, while the tool
list is fixed by the MCP server. Deployment therefore goes through `wrangler`,
either locally or from the workflow above.

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
