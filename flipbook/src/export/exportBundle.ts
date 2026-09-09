/**
 * Offline build pipeline.
 *
 * Turns the live document into something that runs with no server and no
 * network: either a folder-shaped ZIP (index.html + assets/) or a single
 * self-contained HTML file with every asset inlined as a data URL.
 */
import JSZip from 'jszip'
import type { AssetRef, FlipDoc } from '../shared/types'
import { fetchAssetBlob } from '../lib/api'
import { buildStandaloneHtml } from './html'

export type ExportMode = 'zip' | 'single-file'

export interface ExportOptions {
  mode: ExportMode
  /** Download webfonts and inline them so text renders identically offline. */
  embedFonts: boolean
  /** Include `flipbook.json` so the export can be re-imported into the editor. */
  includeSource: boolean
  onProgress?: (step: string, ratio: number) => void
}

export interface ExportResult {
  filename: string
  blob: Blob
  bytes: number
}

const GOOGLE_FONTS = new Set(['Inter', 'Sarabun', 'Prompt', 'Kanit', 'Playfair Display', 'Poppins'])

export async function buildOfflineBundle(
  doc: FlipDoc,
  options: ExportOptions,
): Promise<ExportResult> {
  const report = options.onProgress ?? (() => {})
  const usedAssets = collectUsedAssets(doc)

  report('Collecting assets', 0.05)
  const downloaded = new Map<string, { blob: Blob; asset: AssetRef }>()
  let done = 0
  for (const asset of usedAssets) {
    try {
      const blob = await fetchAssetBlob(asset.url)
      downloaded.set(asset.id, { blob, asset })
    } catch {
      // A missing asset must not fail the whole build; the page shows a
      // placeholder exactly as the editor does.
    }
    done += 1
    report(`Collecting assets (${done}/${usedAssets.length})`, 0.05 + (0.5 * done) / Math.max(usedAssets.length, 1))
  }

  report('Embedding fonts', 0.6)
  const extraHead = options.embedFonts ? await buildFontCss(doc) : buildFontFallbackCss(doc)

  const safeTitle = slugify(doc.title) || 'flipbook'

  if (options.mode === 'single-file') {
    report('Inlining assets', 0.7)
    const dataUrls: Record<string, string> = {}
    for (const [id, { blob }] of downloaded) {
      dataUrls[id] = await blobToDataUrl(blob)
    }
    report('Building HTML', 0.9)
    const html = buildStandaloneHtml(doc, {
      resolve: (src) => resolveWith(src, (id) => dataUrls[id] ?? ''),
      extraHead,
    })
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    report('Done', 1)
    return { filename: `${safeTitle}.html`, blob, bytes: blob.size }
  }

  report('Packaging', 0.7)
  const zip = new JSZip()
  const paths: Record<string, string> = {}
  for (const [id, { blob, asset }] of downloaded) {
    const path = `assets/${id}${extensionFor(asset)}`
    paths[id] = path
    zip.file(path, blob)
  }

  const html = buildStandaloneHtml(doc, {
    resolve: (src) => resolveWith(src, (id) => paths[id] ?? ''),
    extraHead,
  })
  zip.file('index.html', html)
  if (options.includeSource) zip.file('flipbook.json', JSON.stringify(doc, null, 2))
  zip.file('README.txt', readme(doc))

  report('Compressing', 0.85)
  const blob = await zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
    (meta) => report('Compressing', 0.85 + meta.percent / 1000),
  )
  report('Done', 1)
  return { filename: `${safeTitle}.zip`, blob, bytes: blob.size }
}

function resolveWith(src: string, lookup: (id: string) => string): string {
  if (!src.startsWith('asset:')) return src
  return lookup(src.slice('asset:'.length))
}

/** Every asset actually referenced by a page, so unused uploads are skipped. */
export function collectUsedAssets(doc: FlipDoc): AssetRef[] {
  const ids = new Set<string>()
  const add = (src: string | undefined) => {
    if (src && src.startsWith('asset:')) ids.add(src.slice('asset:'.length))
  }
  add(doc.settings.viewerBackground?.image?.src)
  add(doc.settings.paper?.src)
  for (const page of doc.pages) {
    add(page.background.image?.src)
    for (const el of page.elements) {
      if (el.type === 'image') add(el.src)
      if (el.type === 'video') {
        add(el.src)
        add(el.poster)
      }
    }
  }
  return [...ids].map((id) => doc.assets[id]).filter((a): a is AssetRef => Boolean(a))
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

function extensionFor(asset: AssetRef): string {
  const fromName = asset.name.match(/\.[a-z0-9]{2,5}$/i)?.[0]
  if (fromName) return fromName.toLowerCase()
  const map: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/svg+xml': '.svg',
    'video/mp4': '.mp4',
  }
  return map[asset.mime] ?? '.bin'
}

/**
 * Downloads the webfonts the document uses and inlines them as base64
 * `@font-face` rules. Any font that cannot be fetched silently falls back to a
 * system stack, so the export never breaks because of a network hiccup.
 */
async function buildFontCss(doc: FlipDoc): Promise<string> {
  const families = usedFontFamilies(doc).filter((f) => GOOGLE_FONTS.has(f))
  if (families.length === 0) return buildFontFallbackCss(doc)

  const chunks: string[] = []
  for (const family of families) {
    try {
      const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@300;400;600;700;900&display=swap`
      const cssRes = await fetch(url)
      if (!cssRes.ok) continue
      let css = await cssRes.text()
      const urls = [...css.matchAll(/url\((https:\/\/[^)]+)\)/g)].map((m) => m[1])
      for (const fontUrl of urls) {
        const res = await fetch(fontUrl)
        if (!res.ok) continue
        const dataUrl = await blobToDataUrl(await res.blob())
        css = css.split(fontUrl).join(dataUrl)
      }
      chunks.push(css)
    } catch {
      // Offline at export time — fall through to the fallback stack.
    }
  }
  return chunks.length ? `<style>\n${chunks.join('\n')}\n</style>` : buildFontFallbackCss(doc)
}

function buildFontFallbackCss(doc: FlipDoc): string {
  const families = usedFontFamilies(doc)
  if (families.length === 0) return ''
  const rules = families
    .map(
      (f) =>
        `[style*="${f}"] { font-family: "${f}", system-ui, "Segoe UI", "Noto Sans Thai", sans-serif; }`,
    )
    .join('\n')
  return `<style>\n${rules}\n</style>`
}

export function usedFontFamilies(doc: FlipDoc): string[] {
  const set = new Set<string>()
  for (const page of doc.pages) {
    for (const el of page.elements) {
      if (el.type === 'text') set.add(el.fontFamily)
    }
  }
  return [...set]
}

function readme(doc: FlipDoc): string {
  return `${doc.title}
${'='.repeat(doc.title.length)}

Offline flipbook exported from Flipbook Studio.

How to open
-----------
1. Unzip this folder anywhere (USB stick, network share, local disk).
2. Open index.html in any modern browser.

No internet connection, web server or install is required. Keep index.html and
the assets/ folder together.

Controls
--------
  Arrow keys / Page Up / Page Down   turn pages
  Click the left or right page edge  turn pages
  Swipe (touch screens)              turn pages
  Pages                              open the thumbnail strip
  Print / PDF                        print or save the whole book as a PDF
  F                                  fullscreen

Pages: ${doc.pages.length}
Size:  ${doc.settings.width} x ${doc.settings.height} px
`
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9฀-๿]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
