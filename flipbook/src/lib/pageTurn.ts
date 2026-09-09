/**
 * Drag-to-turn maths.
 *
 * Dragging a page should feel like holding paper: the sheet follows the finger
 * instead of waiting for a flick to finish. This module turns a horizontal drag
 * into a rotation, and decides on release whether the turn completes or springs
 * back.
 *
 * The offline viewer runtime carries a mirror of these rules in plain JS
 * (`src/export/runtime/viewer.js`); keep the two in step so a book reads the
 * same in the app and in an exported build.
 */

/** Fraction of a page width that must be dragged for the turn to complete. */
export const TURN_COMMIT_RATIO = 0.35
/** A quick flick completes the turn even if it never reached the ratio. */
export const TURN_FLICK_VELOCITY = 0.5 // page widths per second
/** Below this, a press is a tap (page-edge navigation) rather than a drag. */
export const DRAG_SLOP_PX = 6

export type TurnDirection = 'forward' | 'back'

/**
 * How far through the turn the drag has carried the sheet, 0 → 1.
 *
 * `dx` is the pointer's horizontal movement in screen pixels and `pageWidth`
 * the on-screen width of a single page, so the mapping holds at any zoom.
 */
export function turnProgress(dx: number, pageWidth: number, direction: TurnDirection): number {
  if (pageWidth <= 0) return 0
  // Turning forward drags leftwards, so its useful movement is negative.
  const travelled = direction === 'forward' ? -dx : dx
  return Math.max(0, Math.min(1, travelled / pageWidth))
}

/** Rotation of the dragged sheet, in degrees, for the double-page book. */
export function turnAngle(progress: number, direction: TurnDirection): number {
  return direction === 'forward' ? -180 * progress : -180 * (1 - progress)
}

/**
 * Whether releasing here completes the turn: either the sheet was carried far
 * enough, or it was thrown fast enough to read as a flick.
 */
export function shouldCommitTurn(
  progress: number,
  velocityPxPerMs: number,
  pageWidth: number,
  direction: TurnDirection,
): boolean {
  if (progress >= TURN_COMMIT_RATIO) return true
  if (pageWidth <= 0) return false
  const towards = direction === 'forward' ? -velocityPxPerMs : velocityPxPerMs
  return (towards * 1000) / pageWidth >= TURN_FLICK_VELOCITY
}

/** Shadow strength under a lifted page, so the turn reads as depth. */
export function turnShadow(progress: number): number {
  // Strongest mid-turn, when the sheet stands away from the book.
  return Math.sin(Math.PI * Math.min(1, Math.max(0, progress))) * 0.35
}
