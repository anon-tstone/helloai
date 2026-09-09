import { useEffect, useMemo, useRef, useState } from 'react'
import type { FlipDoc } from '../shared/types'
import { makeResolver, viewerBackgroundStyle } from '../lib/style'
import { PageView } from './PageView'

/**
 * In-app flipbook reader. Mirrors the offline viewer's behaviour (sheet stack,
 * page turns, keyboard and swipe navigation) so previewing matches the export.
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

  const go = (delta: number) => setCursor((c) => Math.max(0, Math.min(c + delta, maxCursor)))

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
                return (
                  <div
                    key={pages[2 * k].id}
                    className={`reader-sheet ${flipped ? 'flipped' : ''}`}
                    style={{
                      width: settings.width,
                      height: settings.height,
                      zIndex: flipped ? k : sheetCount - k,
                      transitionDuration: `${settings.flipDurationMs}ms`,
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
            : pages.map((page, i) => (
                <div
                  key={page.id}
                  className="reader-single"
                  data-state={i === cursor ? 'in' : i < cursor ? 'out-left' : 'out-right'}
                  style={{
                    width: settings.width,
                    height: settings.height,
                    zIndex: i === cursor ? 2 : 1,
                    transitionDuration: `${settings.flipDurationMs}ms`,
                  }}
                >
                  <PageView page={page} settings={settings} resolve={resolve} animate />
                  {settings.showPageNumbers && <span className="reader-no">{i + 1}</span>}
                </div>
              ))}
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
