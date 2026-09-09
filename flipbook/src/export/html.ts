/**
 * Static HTML renderer for export.
 *
 * Produces the same markup the React editor renders, so an exported flipbook is
 * pixel-identical to the canvas. Appearance comes from `lib/style`, which is the
 * single source of truth shared by both renderers.
 */
import type { DocSettings, FlipDoc, FlipElement, FlipPage } from '../shared/types'
import {
  ANIMATION_KEYFRAMES,
  animationCss,
  cssPropsToString,
  fillToCss,
  frameStyle,
  imageStyle,
  lineGeometry,
  pageBackgroundStyle,
  shapeBoxStyle,
  shapeIsBox,
  shapePath,
  textStyle,
  type SrcResolver,
} from '../lib/style'
import viewerCss from './runtime/viewer.css?raw'
import viewerJs from './runtime/viewer.js?raw'

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function styleAttr(props: Record<string, string | number>): string {
  const css = cssPropsToString(props)
  return css ? ` style="${escapeHtml(css)}"` : ''
}

export function renderElementHtml(el: FlipElement, resolve: SrcResolver): string {
  const anim = animationCss(el)
  const frame = { ...frameStyle(el), ...anim }
  const animAttr = el.animation && el.animation.kind !== 'none' ? ' data-anim="1"' : ''
  const inner = renderInnerHtml(el, resolve)
  const body = `<div class="fb-el" data-type="${el.type}"${animAttr}${styleAttr(frame)}>${inner}</div>`
  return wrapLink(el, body)
}

function wrapLink(el: FlipElement, body: string): string {
  if (!el.link) return body
  if (el.link.kind === 'url') {
    return `<a href="${escapeHtml(el.link.url)}" target="_blank" rel="noopener noreferrer" style="display:contents">${body}</a>`
  }
  return `<a href="#page-${el.link.pageIndex + 1}" style="display:contents">${body}</a>`
}

function renderInnerHtml(el: FlipElement, resolve: SrcResolver): string {
  switch (el.type) {
    case 'text':
      return `<div${styleAttr(textStyle(el))}>${escapeHtml(el.text)}</div>`

    case 'image': {
      const src = resolve(el.src)
      if (!src) return '<div class="fb-el-placeholder">No image</div>'
      return `<img src="${escapeHtml(src)}" alt="${escapeHtml(el.name)}"${styleAttr(imageStyle(el))}>`
    }

    case 'shape': {
      if (shapeIsBox(el.shape)) return `<div${styleAttr(shapeBoxStyle(el))}></div>`
      const gradientId = `grad-${el.id}`
      const defs =
        el.fill.kind === 'linear'
          ? `<defs><linearGradient id="${gradientId}" gradientTransform="rotate(${el.fill.angle} .5 .5)"><stop offset="0%" stop-color="${escapeHtml(el.fill.from)}"/><stop offset="100%" stop-color="${escapeHtml(el.fill.to)}"/></linearGradient></defs>`
          : ''
      const fill = el.fill.kind === 'linear' ? `url(#${gradientId})` : fillToCss(el.fill)
      return (
        `<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%;display:block;overflow:visible">${defs}` +
        `<path d="${shapePath(el.shape)}" fill="${escapeHtml(fill)}" stroke="${el.strokeWidth > 0 ? escapeHtml(el.stroke) : 'none'}" stroke-width="${el.strokeWidth}" vector-effect="non-scaling-stroke"/></svg>`
      )
    }

    case 'line': {
      const g = lineGeometry(el)
      const markerId = `cap-${el.id}`
      const markers =
        `<defs><marker id="${markerId}-arrow" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto">` +
        `<path d="M0 0 L10 5 L0 10 Z" fill="${escapeHtml(el.stroke)}"/></marker>` +
        `<marker id="${markerId}-dot" markerWidth="8" markerHeight="8" refX="4" refY="4">` +
        `<circle cx="4" cy="4" r="3.5" fill="${escapeHtml(el.stroke)}"/></marker></defs>`
      const start = el.startCap !== 'none' ? ` marker-start="url(#${markerId}-${el.startCap})"` : ''
      const end = el.endCap !== 'none' ? ` marker-end="url(#${markerId}-${el.endCap})"` : ''
      const dash = el.dash.length ? ` stroke-dasharray="${el.dash.join(' ')}"` : ''
      return (
        `<svg style="width:100%;height:100%;overflow:visible">${markers}` +
        `<line x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}" stroke="${escapeHtml(el.stroke)}" ` +
        `stroke-width="${el.strokeWidth}" stroke-linecap="round"${dash}${start}${end}/></svg>`
      )
    }

    case 'video': {
      const src = resolve(el.src)
      const poster = el.poster ? resolve(el.poster) : ''
      const attrs = [
        el.autoplay ? 'autoplay' : '',
        el.loop ? 'loop' : '',
        el.muted ? 'muted' : '',
        el.controls ? 'controls' : '',
        'playsinline',
      ]
        .filter(Boolean)
        .join(' ')
      const posterAttr = poster ? ` poster="${escapeHtml(poster)}"` : ''
      return `<video src="${escapeHtml(src)}"${posterAttr} ${attrs} style="width:100%;height:100%;object-fit:cover"></video>`
    }

    case 'embed':
      // Author-provided markup; kept verbatim so embeds work offline.
      return el.html
  }
}

export function renderPageHtml(
  page: FlipPage,
  settings: DocSettings,
  resolve: SrcResolver,
  index: number,
): string {
  const bg = pageBackgroundStyle(page.background, resolve)
  const style = {
    position: 'relative',
    width: `${settings.width}px`,
    height: `${settings.height}px`,
    overflow: 'hidden',
    ...bg,
  }
  const elements = page.elements
    .filter((el) => !el.hidden)
    .map((el) => renderElementHtml(el, resolve))
    .join('')
  return `<div class="fb-page" id="page-${index + 1}"${styleAttr(style)}>${elements}</div>`
}

export interface StandaloneOptions {
  /** Overrides `asset:<id>` resolution, e.g. to relative paths inside a ZIP. */
  resolve: SrcResolver
  /** Extra <link>/<style> markup injected into <head> (embedded fonts). */
  extraHead?: string
}

/** Builds the complete, dependency-free `index.html` for an offline flipbook. */
export function buildStandaloneHtml(doc: FlipDoc, opts: StandaloneOptions): string {
  const pagesHtml = doc.pages.map((page, i) => renderPageHtml(page, doc.settings, opts.resolve, i))
  const payload = {
    title: doc.title,
    settings: doc.settings,
    pagesHtml,
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="generator" content="Flipbook Studio">
<title>${escapeHtml(doc.title)}</title>
${opts.extraHead ?? ''}
<style>
${viewerCss}
${ANIMATION_KEYFRAMES}
:root { --fb-bg: ${escapeHtml(doc.settings.backgroundColor)}; }
</style>
</head>
<body>
<div id="fb-app"></div>
<script type="application/json" id="fb-data">${jsonForScript(payload)}</script>
<script>window.__FLIPBOOK__ = JSON.parse(document.getElementById('fb-data').textContent);</script>
<script>
${viewerJs}
</script>
</body>
</html>
`
}

/** JSON safe to embed inside a <script> block. */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}
