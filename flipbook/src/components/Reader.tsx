import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FlipDoc } from '../shared/types'
import { makeResolver, viewerBackgroundStyle } from '../lib/style'
import {
  DRAG_SLOP_PX,
  shouldCommitTurn,
  turnAngle,
  turnProgress,
  turnShadow,
  type TurnDirection,
} from '../lib/pageTurn'
import { PageView } from './PageView'

/**
 * In-app flipbook reader. Mirrors the offline viewer's behaviour — sheet stack,
 * drag-to-turn, keyboard, tap zones — so previewing matches the exported book.
 */
export function Reader({ doc, onClose }: { doc: FlipDoc; onClose?: () => void }) {
  const { settings, pages } = doc
  const isDouble = settings.spread === 'double'
  const sheetCount = isDouble ? Math.ceil(pages.length / 2) : pages.length
  const maxCursor = isDouble ? sheetCount : pages.length - 1

  const [cursor, setCursor] = useState(0)
  const [scale, setScale] = useState(0.3)
  const stageRef = useRef<HTMLDivElement>(null)
  const resolve = useMemo(() => makeResolver(doc), [doc])

  /** Live drag state: which sheet is being carried, and how far. */
  const [turn, setTurn] = useState<{
    sheet: number
    direction: TurnDirection
    progress: number
  } | null>(null)
  const gesture = useRef<{
    pointerId: number
    startX: number
    lastX: number
    lastT: number
    velocity: number
    direction: TurnDirection
    sheet: number
    active: boolean
  } | null>(null)

  const go = (delta: number) => setCursor((c) => Math.max(0, Math.min(c + delta, maxCursor)))

  const pageWidthPx = settings.width * scale

  /**
   * Begin a drag. Which sheet moves depends on which half was grabbed: the
   * right-hand page turns forward, the left-hand page turns back.
   */
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return
      const book = e.currentTarget.getBoundingClientRect()
      const grabbedRightHalf = e.clientX - book.left > book.width / 2
      const direction: TurnDirection = grabbedRightHalf ? 'forward' : 'back'

      // Only start a drag when the turn has somewhere to go.
      const next = cursor + (direction === 'forward' ? 1 : -1)
      if (next < 0 || next > maxCursor) return

      // In a book it is the sheet being lifted that moves; on single pages the
      // page under the finger slides.
      const sheet = isDouble ? (direction === 'forward' ? cursor : cursor - 1) : cursor
      if (sheet < 0 || sheet >= (isDouble ? sheetCount : pages.length)) return
      gesture.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        lastX: e.clientX,
        lastT: performance.now(),
        velocity: 0,
        direction,
        sheet,
        active: false,
      }
      // Capture keeps the drag alive past the book's edge. The spec has it throw
      // when the pointer is already gone, which must not break the gesture.
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // Continue without capture; the drag still tracks pointermove.
      }
    },
    [cursor, isDouble, maxCursor, pages.length, sheetCount],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const g = gesture.current
      if (!g || g.pointerId !== e.pointerId) return
      const dx = e.clientX - g.startX
      // Ignore tiny movements so a tap still reaches the page-edge zones.
      if (!g.active && Math.abs(dx) < DRAG_SLOP_PX) return
      g.active = true

      const now = performance.now()
      const dt = Math.max(1, now - g.lastT)
      g.velocity = (e.clientX - g.lastX) / dt
      g.lastX = e.clientX
      g.lastT = now

      setTurn({
        sheet: g.sheet,
        direction: g.direction,
        progress: turnProgress(dx, pageWidthPx, g.direction),
      })
    },
    [pageWidthPx],
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const g = gesture.current
      if (!g || g.pointerId !== e.pointerId) return
      gesture.current = null
      if (!g.active) {
        setTurn(null)
        return
      }
      const progress = turnProgress(e.clientX - g.startX, pageWidthPx, g.direction)
      if (shouldCommitTurn(progress, g.velocity, pageWidthPx, g.direction)) {
        setCursor((c) =>
          Math.max(0, Math.min(c + (g.direction === 'forward' ? 1 : -1), maxCursor)),
        )
      }
      // Either way the sheet animates from where it was released.
      setTurn(null)
    },
    [maxCursor, pageWidthPx],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') go(1)
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(-1)
      else if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxCursor, onClose])

  useEffect(() => {
    const fit = () => {
      const stage = stageRef.current
      if (!stage) return
      const bookW = isDouble ? settings.width * 2 : settings.width
      setScale(
        Math.max(
          0.02,
          Math.min(
            (stage.clientWidth - 80) / bookW,
            (stage.clientHeight - 140) / settings.height,
          ),
        ),
      )
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [isDouble, settings.width, settings.height])

  const bookWidth = isDouble ? settings.width * 2 : settings.width

  return (
    <div
      className="reader"
      style={viewerBackgroundStyle(settings, resolve) as React.CSSProperties}
    >
      <div className="reader-stage" ref={stageRef}>
        <div
          className="reader-book"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{
            width: bookWidth,
            height: settings.height,
            transform: `translate(-50%, -50%) scale(${scale})`,
            ['--fb-flip-ms' as string]: `${settings.flipDurationMs}ms`,
          }}
        >
          {isDouble
            ? Array.from({ length: sheetCount }, (_, k) => {
                const flipped = k < cursor
                const drag = turn?.sheet === k ? turn : null
                const angle = drag ? turnAngle(drag.progress, drag.direction) : null
                return (
                  <div
                    key={pages[2 * k].id}
                    className={`reader-sheet ${flipped ? 'flipped' : ''}`}
                    style={{
                      width: settings.width,
                      height: settings.height,
                      // A sheet under the finger is lifted above the stack.
                      zIndex: drag ? sheetCount + 1 : flipped ? k : sheetCount - k,
                      transitionDuration: drag ? '0ms' : `${settings.flipDurationMs}ms`,
                      ...(drag && angle !== null
                        ? {
                            transform: `rotateY(${angle}deg)`,
                            filter: `drop-shadow(0 0 ${40 * turnShadow(drag.progress)}px rgba(0,0,0,.5))`,
                          }
                        : {}),
                    }}
                  >
                    <div className="reader-face front">
                      <PageView
                        page={pages[2 * k]}
                        settings={settings}
                        resolve={resolve}
                        animate
                      />
                      {settings.showPageNumbers && <span className="reader-no">{2 * k + 1}</span>}
                    </div>
                    <div className="reader-face back">
                      {pages[2 * k + 1] && (
                        <>
                          <PageView
                            page={pages[2 * k + 1]}
                            settings={settings}
                            resolve={resolve}
                            animate
                          />
                          {settings.showPageNumbers && <span className="reader-no">{2 * k + 2}</span>}
                        </>
                      )}
                    </div>
                  </div>
                )
              })
            : pages.map((page, i) => {
                const drag = turn?.sheet === i ? turn : null
                const shift = drag
                  ? (drag.direction === 'forward' ? -drag.progress : drag.progress) * 100
                  : null
                return (
                <div
                  key={page.id}
                  className="reader-single"
                  data-state={i === cursor ? 'in' : i < cursor ? 'out-left' : 'out-right'}
                  style={{
                    width: settings.width,
                    height: settings.height,
                    zIndex: drag ? 3 : i === cursor ? 2 : 1,
                    transitionDuration: drag ? '0ms' : `${settings.flipDurationMs}ms`,
                    ...(shift !== null
                      ? { transform: `translateX(${shift}%)`, opacity: 1 }
                      : {}),
                  }}
                >
                  <PageView page={page} settings={settings} resolve={resolve} animate />
                  {settings.showPageNumbers && <span className="reader-no">{i + 1}</span>}
                </div>
                )
              })}
        </div>

        <button className="reader-zone prev" onClick={() => go(-1)} aria-label="Previous page" />
        <button className="reader-zone next" onClick={() => go(1)} aria-label="Next page" />
      </div>

      <div className="reader-bar">
        <button onClick={() => setCursor(0)} disabled={cursor === 0}>
          ⏮
        </button>
        <button onClick={() => go(-1)} disabled={cursor === 0}>
          ‹ Prev
        </button>
        <span className="reader-counter">{spreadLabel(cursor, pages.length, isDouble)}</span>
        <button onClick={() => go(1)} disabled={cursor >= maxCursor}>
          Next ›
        </button>
        <button onClick={() => setCursor(maxCursor)} disabled={cursor >= maxCursor}>
          ⏭
        </button>
        {onClose && (
          <>
            <span className="reader-sep" />
            <button onClick={onClose}>Close preview</button>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Label for the current spread. The first spread shows the cover on its own and
 * the last one may have no right-hand page.
 */
function spreadLabel(cursor: number, pageCount: number, isDouble: boolean): string {
  if (!isDouble) return `${cursor + 1} / ${pageCount}`
  const left = 2 * cursor
  const right = left + 1
  if (left === 0) return `1 / ${pageCount}`
  if (right > pageCount) return `${left} / ${pageCount}`
  return `${left}–${right} / ${pageCount}`
}
