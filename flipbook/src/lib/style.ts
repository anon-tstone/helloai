/**
 * Visual model shared by the React editor and the static HTML exporter.
 *
 * Both renderers build their DOM differently (React elements vs. HTML strings)
 * but they compute *appearance* here, so what you see in the editor is exactly
 * what an exported offline flipbook renders.
 */
import type {
  Fill,
  FlipDoc,
  FlipElement,
  ImageElement,
  LineElement,
  PageBackground,
  ShapeElement,
  ShapeKind,
  TextElement,
} from '../shared/types'

export type CssProps = Record<string, string | number>

/** Resolves an element `src` (possibly `asset:<id>`) to something loadable. */
export type SrcResolver = (src: string) => string

export function makeResolver(doc: FlipDoc, override?: Record<string, string>): SrcResolver {
  return (src: string) => {
    if (!src.startsWith('asset:')) return src
    const id = src.slice('asset:'.length)
    if (override && override[id]) return override[id]
    return doc.assets[id]?.url ?? ''
  }
}

export function fillToCss(fill: Fill): string {
  switch (fill.kind) {
    case 'solid':
      return fill.color
    case 'linear':
      return `linear-gradient(${fill.angle}deg, ${fill.from}, ${fill.to})`
    case 'none':
      return 'transparent'
  }
}

export function pageBackgroundStyle(bg: PageBackground, resolve: SrcResolver): CssProps {
  const style: CssProps = { background: fillToCss(bg.fill) }
  if (bg.image?.src) {
    // The image layer is composited above the fill via a second background.
    const url = resolve(bg.image.src)
    if (url) {
      style.backgroundImage = `url("${url}")`
      style.backgroundSize = bg.image.fit === 'fill' ? '100% 100%' : bg.image.fit
      style.backgroundPosition = 'center'
      style.backgroundRepeat = 'no-repeat'
      style.backgroundColor = fillToCss(bg.fill)
      style.opacity = 1
      delete style.background
    }
  }
  return style
}

/** Absolute frame of an element inside a page: position, size, rotation. */
export function frameStyle(el: FlipElement): CssProps {
  const style: CssProps = {
    position: 'absolute',
    left: `${el.x}px`,
    top: `${el.y}px`,
    width: `${el.w}px`,
    height: `${el.h}px`,
    opacity: el.opacity,
    transform: el.rotation ? `rotate(${el.rotation}deg)` : 'none',
    transformOrigin: 'center center',
  }
  if (el.hidden) style.display = 'none'
  if (el.shadow) {
    const s = el.shadow
    if (el.type === 'text') {
      style.textShadow = `${s.x}px ${s.y}px ${s.blur}px ${s.color}`
    } else {
      style.filter = `drop-shadow(${s.x}px ${s.y}px ${s.blur}px ${s.color})`
    }
  }
  return style
}

export function textStyle(el: TextElement): CssProps {
  return {
    fontFamily: `"${el.fontFamily}", system-ui, sans-serif`,
    fontSize: `${el.fontSize}px`,
    fontWeight: el.fontWeight,
    fontStyle: el.italic ? 'italic' : 'normal',
    textDecoration: el.underline ? 'underline' : 'none',
    textAlign: el.align,
    color: el.color,
    lineHeight: el.lineHeight,
    letterSpacing: `${el.letterSpacing}px`,
    textTransform: el.uppercase ? 'uppercase' : 'none',
    display: 'flex',
    flexDirection: 'column',
    justifyContent:
      el.verticalAlign === 'top'
        ? 'flex-start'
        : el.verticalAlign === 'bottom'
          ? 'flex-end'
          : 'center',
    width: '100%',
    height: '100%',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    overflow: 'hidden',
  }
}

export function imageFilterCss(el: ImageElement): string {
  const f = el.filter
  const parts: string[] = []
  if (f.brightness !== 100) parts.push(`brightness(${f.brightness}%)`)
  if (f.contrast !== 100) parts.push(`contrast(${f.contrast}%)`)
  if (f.saturate !== 100) parts.push(`saturate(${f.saturate}%)`)
  if (f.blur) parts.push(`blur(${f.blur}px)`)
  if (f.grayscale) parts.push(`grayscale(${f.grayscale}%)`)
  return parts.join(' ') || 'none'
}

export function imageStyle(el: ImageElement): CssProps {
  const scaleX = el.flipX ? -1 : 1
  const scaleY = el.flipY ? -1 : 1
  return {
    width: '100%',
    height: '100%',
    objectFit: el.fit,
    borderRadius: `${el.radius}px`,
    filter: imageFilterCss(el),
    transform: scaleX === 1 && scaleY === 1 ? 'none' : `scale(${scaleX}, ${scaleY})`,
    display: 'block',
    pointerEvents: 'none',
  }
}

/**
 * SVG path for a shape normalised to a 100x100 viewBox, so shapes stretch with
 * the element box exactly like the editor preview.
 */
export function shapePath(kind: ShapeKind): string {
  switch (kind) {
    case 'triangle':
      return 'M50 2 L98 98 L2 98 Z'
    case 'diamond':
      return 'M50 2 L98 50 L50 98 L2 50 Z'
    case 'pentagon':
      return 'M50 2 L97 37 L79 96 L21 96 L3 37 Z'
    case 'hexagon':
      return 'M25 4 L75 4 L98 50 L75 96 L25 96 L2 50 Z'
    case 'star':
      return 'M50 2 L61 36 L97 36 L68 58 L79 94 L50 71 L21 94 L32 58 L3 36 L39 36 Z'
    case 'heart':
      return 'M50 96 C10 66 2 44 2 30 C2 14 14 4 27 4 C37 4 45 10 50 20 C55 10 63 4 73 4 C86 4 98 14 98 30 C98 44 90 66 50 96 Z'
    case 'arrow':
      return 'M2 35 L62 35 L62 8 L98 50 L62 92 L62 65 L2 65 Z'
    case 'speech':
      return 'M6 6 L94 6 L94 72 L54 72 L30 96 L32 72 L6 72 Z'
    case 'ellipse':
      return 'M50 2 A48 48 0 1 1 49.9 2 Z'
    case 'rect':
    default:
      return 'M0 0 L100 0 L100 100 L0 100 Z'
  }
}

/** True when a shape is better rendered as a plain div (supports radius). */
export function shapeIsBox(kind: ShapeKind): boolean {
  return kind === 'rect' || kind === 'ellipse'
}

export function shapeBoxStyle(el: ShapeElement): CssProps {
  const radius =
    el.shape === 'ellipse' ? '50%' : `${el.radius}px`
  return {
    width: '100%',
    height: '100%',
    background: fillToCss(el.fill),
    borderRadius: radius,
    border: el.strokeWidth > 0 ? `${el.strokeWidth}px solid ${el.stroke}` : 'none',
    boxSizing: 'border-box',
  }
}

export interface LineGeometry {
  x1: number
  y1: number
  x2: number
  y2: number
}

/** A line element draws from the left-middle to the right-middle of its box. */
export function lineGeometry(el: LineElement): LineGeometry {
  return { x1: 0, y1: el.h / 2, x2: el.w, y2: el.h / 2 }
}

export function cssPropsToString(props: CssProps): string {
  return Object.entries(props)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${kebab(k)}:${typeof v === 'number' && !UNITLESS.has(k) ? v : v}`)
    .join(';')
}

const UNITLESS = new Set(['opacity', 'zIndex', 'lineHeight', 'fontWeight', 'flexGrow'])

export function kebab(key: string): string {
  return key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
}

export function animationCss(el: FlipElement): CssProps {
  const a = el.animation
  if (!a || a.kind === 'none') return {}
  return {
    animationName: `fb-${a.kind}`,
    animationDuration: `${a.duration}ms`,
    animationDelay: `${a.delay}ms`,
    animationFillMode: 'both',
    animationTimingFunction: 'cubic-bezier(.2,.7,.3,1)',
  }
}

/** Keyframes referenced by `animationCss`, injected once per document. */
export const ANIMATION_KEYFRAMES = `
@keyframes fb-fade { from { opacity: 0 } to { opacity: inherit } }
@keyframes fb-slide-up { from { opacity: 0; translate: 0 40px } to { opacity: inherit; translate: 0 0 } }
@keyframes fb-slide-left { from { opacity: 0; translate: 40px 0 } to { opacity: inherit; translate: 0 0 } }
@keyframes fb-zoom { from { opacity: 0; scale: .85 } to { opacity: inherit; scale: 1 } }
@keyframes fb-pop { 0% { opacity: 0; scale: .6 } 70% { scale: 1.06 } 100% { opacity: inherit; scale: 1 } }
`
