/**
 * Animation sequencing.
 *
 * Elements say *when* they start relative to the page or to each other, and
 * this module turns that into concrete millisecond timings. Keeping the
 * document declarative means reordering layers or changing a speed re-times the
 * whole sequence automatically, instead of leaving stale hand-typed delays
 * behind.
 *
 * The editor preview, the reader and the exported HTML all resolve timings
 * here, so a page animates identically in all three.
 */
import type { AnimationKind, ElementAnimation, FlipElement, FlipPage } from '../shared/types'

/** Breathing room between one element finishing and the next starting. */
export const SEQUENCE_GAP_MS = 120

export interface ResolvedAnimation {
  kind: AnimationKind
  delayMs: number
  durationMs: number
}

export const SPEED_PRESETS = [
  { id: 'slow', label: 'Slow', ms: 900 },
  { id: 'normal', label: 'Normal', ms: 600 },
  { id: 'fast', label: 'Fast', ms: 350 },
] as const

export const DEFAULT_ANIMATION: ElementAnimation = {
  kind: 'fade',
  start: 'with-page',
  delay: 0,
  duration: 600,
}

export const ANIMATION_CHOICES: { id: AnimationKind; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'fade', label: 'Fade' },
  { id: 'slide-up', label: 'Rise' },
  { id: 'slide-down', label: 'Drop' },
  { id: 'slide-left', label: 'From right' },
  { id: 'slide-right', label: 'From left' },
  { id: 'zoom', label: 'Zoom' },
  { id: 'pop', label: 'Pop' },
  { id: 'flip', label: 'Flip' },
  { id: 'blur', label: 'Blur in' },
]

/**
 * Timings for every animated element on a page.
 *
 * Elements resolve in paint order — the order shown in the Layers panel, read
 * bottom-up — so dragging a layer also moves its place in the sequence.
 */
export function resolvePageAnimations(page: FlipPage): Map<string, ResolvedAnimation> {
  const resolved = new Map<string, ResolvedAnimation>()
  let previousEnd = 0

  for (const el of page.elements) {
    const animation = el.animation
    if (!animation || animation.kind === 'none' || el.hidden) continue

    const duration = Math.max(0, animation.duration)
    const start =
      animation.start === 'after-previous'
        ? previousEnd + SEQUENCE_GAP_MS + animation.delay
        : animation.delay

    const delayMs = Math.max(0, start)
    resolved.set(el.id, { kind: animation.kind, delayMs, durationMs: duration })
    previousEnd = Math.max(previousEnd, delayMs + duration)
  }

  return resolved
}

/** How long the whole page takes to finish animating, for preview timing. */
export function pageAnimationDuration(page: FlipPage): number {
  let end = 0
  for (const timing of resolvePageAnimations(page).values()) {
    end = Math.max(end, timing.delayMs + timing.durationMs)
  }
  return end
}

/** True when anything on the page animates at all. */
export function pageHasAnimation(page: FlipPage): boolean {
  return page.elements.some((el) => el.animation && el.animation.kind !== 'none' && !el.hidden)
}

/**
 * Applies one effect across a whole page as a staggered sequence — the
 * one-click way to animate a page without touching each element.
 */
export function sequenceForPage(
  elements: FlipElement[],
  kind: AnimationKind,
  durationMs: number,
): Map<string, ElementAnimation> {
  const out = new Map<string, ElementAnimation>()
  elements.forEach((el, index) => {
    out.set(el.id, {
      kind,
      // The first element opens with the page; the rest follow it in turn.
      start: index === 0 ? 'with-page' : 'after-previous',
      delay: 0,
      duration: durationMs,
    })
  })
  return out
}
