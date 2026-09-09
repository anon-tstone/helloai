/**
 * Flipbook Studio API — Cloudflare Worker.
 *
 * Storage split:
 *   D1  projects/assets metadata (listing, ownership, publish state)
 *   R2  document JSON and uploaded media (no practical size ceiling)
 *   KV  published snapshots, read straight from the edge
 *
 * Ownership is an anonymous, cookie-scoped id — enough to keep one browser's
 * projects private from another's. It is not an authentication system; add a
 * real identity provider before using this for anything confidential.
 */
import { Hono } from 'hono'
import type { FlipDoc } from '../src/shared/types'

export interface Env {
  DB: D1Database
  BUCKET: R2Bucket
  PUBLISHED: KVNamespace
  ASSETS: Fetcher
}

const OWNER_COOKIE = 'fb_owner'
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024
const MAX_DOC_BYTES = 20 * 1024 * 1024
const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/svg+xml',
  'video/mp4',
  'video/webm',
])

type Vars = { ownerId: string }

const app = new Hono<{ Bindings: Env; Variables: Vars }>()

// ---------------------------------------------------------------------------
// Anonymous ownership
// ---------------------------------------------------------------------------

app.use('/api/*', async (c, next) => {
  let ownerId = readCookie(c.req.header('cookie'), OWNER_COOKIE)
  let issued = false
  if (!ownerId || !/^[A-Za-z0-9_-]{16,64}$/.test(ownerId)) {
    ownerId = crypto.randomUUID().replace(/-/g, '')
    issued = true
  }
  c.set('ownerId', ownerId)
  await next()
  if (issued) {
    c.header(
      'set-cookie',
      `${OWNER_COOKIE}=${ownerId}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`,
      { append: true },
    )
  }
})

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

app.get('/api/projects', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, title, page_count, slug, updated_at
     FROM projects WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 100`,
  )
    .bind(c.get('ownerId'))
    .all<{
      id: string
      title: string
      page_count: number
      slug: string | null
      updated_at: number
    }>()

  return c.json({
    projects: (results ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      pageCount: row.page_count,
      updatedAt: row.updated_at,
      thumbnail: null,
      published: Boolean(row.slug),
    })),
  })
})

app.post('/api/projects', async (c) => {
  const body = await c.req.json<{ doc: FlipDoc }>().catch(() => null)
  const doc = body?.doc
  if (!isFlipDoc(doc)) return c.json({ error: 'Invalid document' }, 400)

  const serialized = JSON.stringify(doc)
  if (serialized.length > MAX_DOC_BYTES) return c.json({ error: 'Document too large' }, 413)

  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
  const docKey = `projects/${id}.json`
  const now = Date.now()

  await c.env.BUCKET.put(docKey, serialized, {
    httpMetadata: { contentType: 'application/json' },
  })
  await c.env.DB.prepare(
    `INSERT INTO projects (id, owner_id, title, page_count, doc_key, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, c.get('ownerId'), doc.title, doc.pages.length, docKey, now, now)
    .run()

  return c.json({ id }, 201)
})

app.get('/api/projects/:id', async (c) => {
  const row = await ownedProject(c.env, c.get('ownerId'), c.req.param('id'))
  if (!row) return c.json({ error: 'Not found' }, 404)

  const object = await c.env.BUCKET.get(row.doc_key)
  if (!object) return c.json({ error: 'Document data missing' }, 404)

  return c.json({ id: row.id, doc: JSON.parse(await object.text()) as FlipDoc })
})

app.put('/api/projects/:id', async (c) => {
  const id = c.req.param('id')
  const row = await ownedProject(c.env, c.get('ownerId'), id)
  if (!row) return c.json({ error: 'Not found' }, 404)

  const body = await c.req.json<{ doc: FlipDoc }>().catch(() => null)
  const doc = body?.doc
  if (!isFlipDoc(doc)) return c.json({ error: 'Invalid document' }, 400)

  const serialized = JSON.stringify(doc)
  if (serialized.length > MAX_DOC_BYTES) return c.json({ error: 'Document too large' }, 413)

  const now = Date.now()
  await c.env.BUCKET.put(row.doc_key, serialized, {
    httpMetadata: { contentType: 'application/json' },
  })
  await c.env.DB.prepare(
    `UPDATE projects SET title = ?, page_count = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(doc.title, doc.pages.length, now, id)
    .run()

  // A published book stays in sync with its source on every save.
  if (row.slug) await c.env.PUBLISHED.put(publishedKey(row.slug), serialized)

  return c.json({ id, updatedAt: now })
})

app.delete('/api/projects/:id', async (c) => {
  const id = c.req.param('id')
  const row = await ownedProject(c.env, c.get('ownerId'), id)
  if (!row) return c.json({ error: 'Not found' }, 404)

  await c.env.BUCKET.delete(row.doc_key)
  if (row.slug) await c.env.PUBLISHED.delete(publishedKey(row.slug))
  await c.env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(id).run()
  return c.body(null, 204)
})

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

app.post('/api/projects/:id/publish', async (c) => {
  const id = c.req.param('id')
  const row = await ownedProject(c.env, c.get('ownerId'), id)
  if (!row) return c.json({ error: 'Not found' }, 404)

  const body = await c.req.json<{ slug?: string }>().catch(() => ({}) as { slug?: string })
  const requested = sanitizeSlug(body.slug ?? row.title) || 'book'
  const slug = row.slug ?? (await uniqueSlug(c.env, requested, id))

  const object = await c.env.BUCKET.get(row.doc_key)
  if (!object) return c.json({ error: 'Document data missing' }, 404)

  await c.env.PUBLISHED.put(publishedKey(slug), await object.text())
  await c.env.DB.prepare('UPDATE projects SET slug = ? WHERE id = ?').bind(slug, id).run()

  return c.json({ slug, url: `/v/${slug}` })
})

app.delete('/api/projects/:id/publish', async (c) => {
  const id = c.req.param('id')
  const row = await ownedProject(c.env, c.get('ownerId'), id)
  if (!row) return c.json({ error: 'Not found' }, 404)
  if (row.slug) await c.env.PUBLISHED.delete(publishedKey(row.slug))
  await c.env.DB.prepare('UPDATE projects SET slug = NULL WHERE id = ?').bind(id).run()
  return c.body(null, 204)
})

app.get('/api/published/:slug', async (c) => {
  const slug = sanitizeSlug(c.req.param('slug'))
  if (!slug) return c.json({ error: 'Not found' }, 404)
  const raw = await c.env.PUBLISHED.get(publishedKey(slug))
  if (!raw) return c.json({ error: 'Not found' }, 404)
  return new Response(`{"doc":${raw}}`, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=60',
    },
  })
})

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

app.post('/api/assets', async (c) => {
  const form = await c.req.formData().catch(() => null)
  // The Workers type declarations narrow `FormData.get` to `string | null`, but
  // the runtime hands back a `File` for file parts.
  const entry = form?.get('file') as unknown as File | string | null | undefined
  if (!entry || typeof entry === 'string') return c.json({ error: 'No file uploaded' }, 400)
  const file = entry
  if (file.size > MAX_UPLOAD_BYTES) return c.json({ error: 'File too large (max 25 MB)' }, 413)
  if (!ALLOWED_MIME.has(file.type)) return c.json({ error: `Unsupported type: ${file.type}` }, 415)

  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 20)
  const key = `assets/${id}`
  const bytes = await file.arrayBuffer()

  await c.env.BUCKET.put(key, bytes, {
    httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' },
  })

  const dims = file.type.startsWith('image/') ? imageSize(new Uint8Array(bytes), file.type) : null

  await c.env.DB.prepare(
    `INSERT INTO assets (id, owner_id, name, mime, size, width, height, r2_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      c.get('ownerId'),
      file.name,
      file.type,
      file.size,
      dims?.width ?? null,
      dims?.height ?? null,
      key,
      Date.now(),
    )
    .run()

  return c.json(
    {
      id,
      name: file.name,
      mime: file.type,
      size: file.size,
      width: dims?.width,
      height: dims?.height,
      url: `/api/assets/${id}`,
    },
    201,
  )
})

app.get('/api/assets/:id', async (c) => {
  const id = c.req.param('id')
  if (!/^[a-z0-9]{1,32}$/i.test(id)) return c.notFound()

  const object = await c.env.BUCKET.get(`assets/${id}`)
  if (!object) return c.notFound()

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set('cache-control', 'public, max-age=31536000, immutable')
  // Assets are embedded into offline exports, which fetch them cross-origin.
  headers.set('access-control-allow-origin', '*')
  return new Response(object.body, { headers })
})

app.get('/api/health', (c) => c.json({ ok: true, service: 'flipbook-studio' }))

// ---------------------------------------------------------------------------
// Static site
// ---------------------------------------------------------------------------

app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404))

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/')) {
      return app.fetch(request, env, ctx)
    }
    // `/v/<slug>` is a client-side route; serve the SPA shell for it.
    if (url.pathname.startsWith('/v/')) {
      return env.ASSETS.fetch(new Request(new URL('/', url), request))
    }
    return env.ASSETS.fetch(request)
  },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ProjectRow {
  id: string
  doc_key: string
  slug: string | null
  title: string
}

async function ownedProject(
  env: Env,
  ownerId: string,
  id: string,
): Promise<ProjectRow | null> {
  if (!/^[a-z0-9]{1,32}$/i.test(id)) return null
  return env.DB.prepare(
    'SELECT id, doc_key, slug, title FROM projects WHERE id = ? AND owner_id = ?',
  )
    .bind(id, ownerId)
    .first<ProjectRow>()
}

function publishedKey(slug: string): string {
  return `published:${slug}`
}

async function uniqueSlug(env: Env, base: string, projectId: string): Promise<string> {
  const taken = await env.DB.prepare('SELECT id FROM projects WHERE slug = ?')
    .bind(base)
    .first<{ id: string }>()
  if (!taken || taken.id === projectId) return base
  return `${base}-${projectId.slice(0, 6)}`
}

function sanitizeSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return null
}

function isFlipDoc(value: unknown): value is FlipDoc {
  if (!value || typeof value !== 'object') return false
  const doc = value as Partial<FlipDoc>
  return (
    typeof doc.title === 'string' &&
    Array.isArray(doc.pages) &&
    doc.pages.length > 0 &&
    typeof doc.settings === 'object' &&
    doc.settings !== null
  )
}

/**
 * Reads intrinsic dimensions straight from the file header so the editor can
 * place uploads at their true aspect ratio. Unknown formats simply return null.
 */
function imageSize(bytes: Uint8Array, mime: string): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  try {
    if (mime === 'image/png' && bytes.length > 24) {
      return { width: view.getUint32(16), height: view.getUint32(20) }
    }
    if (mime === 'image/gif' && bytes.length > 10) {
      return { width: view.getUint16(6, true), height: view.getUint16(8, true) }
    }
    if (mime === 'image/jpeg') {
      let offset = 2
      while (offset + 9 < bytes.length) {
        if (view.getUint8(offset) !== 0xff) break
        const marker = view.getUint8(offset + 1)
        const length = view.getUint16(offset + 2)
        // SOF0..SOF15, excluding the DHT/DAC/DNL markers in that range.
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) }
        }
        offset += 2 + length
      }
    }
  } catch {
    // Truncated or unexpected header — fall through.
  }
  return null
}
