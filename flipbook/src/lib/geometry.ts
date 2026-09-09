import type { FlipElement } from '../shared/types'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Point {
  x: number
  y: number
}

export const rad = (deg: number) => (deg * Math.PI) / 180

export function rectCenter(r: Rect): Point {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
}

/** Rotate `p` around `origin` by `deg` degrees clockwise. */
export function rotatePoint(p: Point, origin: Point, deg: number): Point {
  if (!deg) return { ...p }
  const a = rad(deg)
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const dx = p.x - origin.x
  const dy = p.y - origin.y
  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  }
}

/** The four corners of a rect after rotation, in document space. */
export function rectCorners(r: Rect, rotation: number): Point[] {
  const c = rectCenter(r)
  const pts: Point[] = [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ]
  return pts.map((p) => rotatePoint(p, c, rotation))
}

/** Axis-aligned bounding box of a rotated rect. */
export function aabb(r: Rect, rotation: number): Rect {
  if (!rotation) return { ...r }
  const pts = rectCorners(r, rotation)
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY }
}

export function elementRect(el: FlipElement): Rect {
  return { x: el.x, y: el.y, w: el.w, h: el.h }
}

/** Union of the axis-aligned bounds of every element. */
export function boundsOf(elements: FlipElement[]): Rect | null {
  if (elements.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const el of elements) {
    const b = aabb(elementRect(el), el.rotation)
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.w)
    maxY = Math.max(maxY, b.y + b.h)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y)
}

export function pointInRect(p: Point, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
}

/** Hit test that accounts for the element's rotation. */
export function hitTest(p: Point, el: FlipElement): boolean {
  const r = elementRect(el)
  const local = rotatePoint(p, rectCenter(r), -el.rotation)
  return pointInRect(local, r)
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export function round(v: number, precision = 2): number {
  const f = 10 ** precision
  return Math.round(v * f) / f
}

// ---------------------------------------------------------------------------
// Snapping
// ---------------------------------------------------------------------------

export interface SnapGuide {
  axis: 'x' | 'y'
  /** Position of the guide line in document space. */
  at: number
  /** Extent of the guide so it can be drawn only where it is relevant. */
  from: number
  to: number
}

export interface SnapResult {
  dx: number
  dy: number
  guides: SnapGuide[]
}

interface SnapCandidate {
  axis: 'x' | 'y'
  at: number
  span: [number, number]
}

/**
 * Snap a moving bounding box against page edges, page centre and the bounds of
 * other elements. Returns the delta to apply plus the guides to draw.
 */
export function computeSnap(
  moving: Rect,
  others: Rect[],
  page: { width: number; height: number },
  threshold: number,
): SnapResult {
  const candidates: SnapCandidate[] = []

  const pushRect = (r: Rect) => {
    candidates.push({ axis: 'x', at: r.x, span: [r.y, r.y + r.h] })
    candidates.push({ axis: 'x', at: r.x + r.w / 2, span: [r.y, r.y + r.h] })
    candidates.push({ axis: 'x', at: r.x + r.w, span: [r.y, r.y + r.h] })
    candidates.push({ axis: 'y', at: r.y, span: [r.x, r.x + r.w] })
    candidates.push({ axis: 'y', at: r.y + r.h / 2, span: [r.x, r.x + r.w] })
    candidates.push({ axis: 'y', at: r.y + r.h, span: [r.x, r.x + r.w] })
  }

  pushRect({ x: 0, y: 0, w: page.width, h: page.height })
  others.forEach(pushRect)

  const movingEdges = {
    x: [moving.x, moving.x + moving.w / 2, moving.x + moving.w],
    y: [moving.y, moving.y + moving.h / 2, moving.y + moving.h],
  }

  let best: Record<'x' | 'y', { delta: number; dist: number; guide: SnapGuide } | null> = {
    x: null,
    y: null,
  }

  for (const c of candidates) {
    for (const edge of movingEdges[c.axis]) {
      const dist = Math.abs(c.at - edge)
      if (dist > threshold) continue
      const current = best[c.axis]
      if (current && current.dist <= dist) continue
      const movingSpan: [number, number] =
        c.axis === 'x' ? [moving.y, moving.y + moving.h] : [moving.x, moving.x + moving.w]
      best[c.axis] = {
        delta: c.at - edge,
        dist,
        guide: {
          axis: c.axis,
          at: c.at,
          from: Math.min(c.span[0], movingSpan[0]),
          to: Math.max(c.span[1], movingSpan[1]),
        },
      }
    }
  }

  const guides: SnapGuide[] = []
  if (best.x) guides.push(best.x.guide)
  if (best.y) guides.push(best.y.guide)
  return { dx: best.x?.delta ?? 0, dy: best.y?.delta ?? 0, guides }
}

// ---------------------------------------------------------------------------
// Resizing
// ---------------------------------------------------------------------------

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

const HANDLE_DIR: Record<Handle, { x: -1 | 0 | 1; y: -1 | 0 | 1 }> = {
  nw: { x: -1, y: -1 },
  n: { x: 0, y: -1 },
  ne: { x: 1, y: -1 },
  e: { x: 1, y: 0 },
  se: { x: 1, y: 1 },
  s: { x: 0, y: 1 },
  sw: { x: -1, y: 1 },
  w: { x: -1, y: 0 },
}

export function handleDirection(handle: Handle) {
  return HANDLE_DIR[handle]
}

const MIN_SIZE = 8

/** Rotate a vector (not a point) by `deg` degrees clockwise. */
export function rotateVec(v: Point, deg: number): Point {
  if (!deg) return { ...v }
  const a = rad(deg)
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos }
}

/**
 * Resize a (possibly rotated) rect by dragging `handle` to `pointer`.
 *
 * The corner or edge opposite the dragged handle stays pinned in document
 * space, which is what makes rotated resizing feel correct. Everything is
 * computed in the element's own (unrotated) frame and mapped back at the end.
 */
export function resizeRotatedRect(
  original: Rect,
  rotation: number,
  handle: Handle,
  pointer: Point,
  opts: { keepAspect?: boolean } = {},
): Rect {
  const dir = HANDLE_DIR[handle]
  const center = rectCenter(original)

  // Pinned point: the opposite corner, or the midpoint of the opposite edge.
  const anchorOffset: Point = { x: (-dir.x * original.w) / 2, y: (-dir.y * original.h) / 2 }
  const anchorWorld = {
    x: center.x + rotateVec(anchorOffset, rotation).x,
    y: center.y + rotateVec(anchorOffset, rotation).y,
  }

  // Pointer measured along the element's own axes, relative to the anchor.
  const v = rotateVec({ x: pointer.x - anchorWorld.x, y: pointer.y - anchorWorld.y }, -rotation)

  let w = dir.x === 0 ? original.w : Math.max(MIN_SIZE, v.x * dir.x)
  let h = dir.y === 0 ? original.h : Math.max(MIN_SIZE, v.y * dir.y)

  if (opts.keepAspect && dir.x !== 0 && dir.y !== 0) {
    const ratio = original.w / original.h
    if (w / h > ratio) w = h * ratio
    else h = w / ratio
  }

  // New centre sits half the new size away from the anchor, along the drag axes.
  const centerOffset: Point = { x: (dir.x * w) / 2, y: (dir.y * h) / 2 }
  const rotatedCenterOffset = rotateVec(centerOffset, rotation)
  const newCenter: Point = {
    x: anchorWorld.x + rotatedCenterOffset.x,
    y: anchorWorld.y + rotatedCenterOffset.y,
  }

  return { x: newCenter.x - w / 2, y: newCenter.y - h / 2, w, h }
}

/** Angle in degrees from `center` to `p`, with 0 pointing up. */
export function angleFrom(center: Point, p: Point): number {
  return (Math.atan2(p.y - center.y, p.x - center.x) * 180) / Math.PI + 90
}
