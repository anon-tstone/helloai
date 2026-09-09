import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useEditor } from '../store/editor'
import type { FlipElement, TextElement } from '../shared/types'
import { makeResolver, textStyle } from '../lib/style'
import {
  aabb,
  angleFrom,
  boundsOf,
  computeSnap,
  elementRect,
  hitTest,
  rectsIntersect,
  resizeRotatedRect,
  rotateVec,
  round,
  type Handle,
  type Point,
  type Rect,
  type SnapGuide,
} from '../lib/geometry'
import { createLine, createShape, createText } from '../lib/factory'
import { PageView } from './PageView'

type Drag =
  | { kind: 'none' }
  | {
      kind: 'move'
      start: Point
      originals: Map<string, Rect>
    }
  | {
      kind: 'resize'
      handle: Handle
      start: Point
      originals: Map<string, Rect>
      bounds: Rect
    }
  | {
      kind: 'rotate'
      center: Point
      startAngle: number
      originals: Map<string, { rect: Rect; rotation: number }>
    }
  | { kind: 'marquee'; start: Point; current: Point; additive: boolean }
  | { kind: 'pan'; start: Point; startPan: Point }
  | { kind: 'create'; start: Point; current: Point }

const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const SNAP_THRESHOLD_PX = 6

export function Canvas() {
  const doc = useEditor((s) => s.doc)
  const pageIndex = useEditor((s) => s.pageIndex)
  const selection = useEditor((s) => s.selection)
  const zoom = useEditor((s) => s.zoom)
  const pan = useEditor((s) => s.pan)
  const tool = useEditor((s) => s.tool)
  const showGrid = useEditor((s) => s.showGrid)
  const snapEnabled = useEditor((s) => s.snapEnabled)
  const editingTextId = useEditor((s) => s.editingTextId)

  const viewportRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag>({ kind: 'none' })
  const [guides, setGuides] = useState<SnapGuide[]>([])
  const [spaceHeld, setSpaceHeld] = useState(false)

  const page = doc.pages[pageIndex]
  const resolve = useMemo(() => makeResolver(doc), [doc])
  const selected = useMemo(
    () => (page ? page.elements.filter((e) => selection.includes(e.id)) : []),
    [page, selection],
  )
  const selectionBounds = useMemo(() => boundsOf(selected), [selected])

  /** Convert a pointer event to document coordinates. */
  const toDoc = useCallback((e: { clientX: number; clientY: number }): Point => {
    const rect = pageRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    const z = useEditor.getState().zoom
    return { x: (e.clientX - rect.left) / z, y: (e.clientY - rect.top) / z }
  }, [])

  // -- fit on first mount ---------------------------------------------------
  useLayoutEffect(() => {
    const el = viewportRef.current
    if (!el) return
    useEditor.getState().zoomToFit({ width: el.clientWidth, height: el.clientHeight })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // -- space bar panning ----------------------------------------------------
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTypingTarget(e.target)) {
        e.preventDefault()
        setSpaceHeld(true)
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceHeld(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // -- wheel: zoom with modifier, otherwise pan -----------------------------
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const store = useEditor.getState()
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY / 300)
        store.setZoom(store.zoom * factor)
      } else {
        store.setPan({ x: store.pan.x - e.deltaX, y: store.pan.y - e.deltaY })
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  if (!page) return <div className="canvas-viewport" ref={viewportRef} />

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button === 1 || spaceHeld || tool === 'hand') {
      setDrag({ kind: 'pan', start: { x: e.clientX, y: e.clientY }, startPan: pan })
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
      return
    }
    if (e.button !== 0) return

    const p = toDoc(e)
    const store = useEditor.getState()

    if (tool !== 'select') {
      store.pushHistory()
      setDrag({ kind: 'create', start: p, current: p })
      return
    }

    // Topmost element under the cursor wins.
    const hit = [...page.elements].reverse().find((el) => !el.hidden && !el.locked && hitTest(p, el))
    if (!hit) {
      setDrag({ kind: 'marquee', start: p, current: p, additive: e.shiftKey })
      if (!e.shiftKey) store.clearSelection()
      return
    }

    const alreadySelected = selection.includes(hit.id)
    if (e.shiftKey) {
      store.select(
        alreadySelected ? selection.filter((id) => id !== hit.id) : [hit.id],
        !alreadySelected,
      )
      return
    }
    if (!alreadySelected) store.select([hit.id])

    const ids = alreadySelected ? selection : useEditor.getState().selection
    store.pushHistory()
    setDrag({ kind: 'move', start: p, originals: snapshot(page.elements, ids) })
  }

  const startResize = (handle: Handle) => (e: React.PointerEvent) => {
    e.stopPropagation()
    if (!selectionBounds) return
    const store = useEditor.getState()
    store.pushHistory()
    setDrag({
      kind: 'resize',
      handle,
      start: toDoc(e),
      originals: snapshot(page.elements, selection),
      bounds: selectionBounds,
    })
  }

  const startRotate = (e: React.PointerEvent) => {
    e.stopPropagation()
    if (!selectionBounds) return
    const center = {
      x: selectionBounds.x + selectionBounds.w / 2,
      y: selectionBounds.y + selectionBounds.h / 2,
    }
    const store = useEditor.getState()
    store.pushHistory()
    setDrag({
      kind: 'rotate',
      center,
      startAngle: angleFrom(center, toDoc(e)),
      originals: new Map(
        selected.map((el) => [el.id, { rect: elementRect(el), rotation: el.rotation }]),
      ),
    })
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (drag.kind === 'none') return
    const store = useEditor.getState()

    if (drag.kind === 'pan') {
      store.setPan({
        x: drag.startPan.x + (e.clientX - drag.start.x),
        y: drag.startPan.y + (e.clientY - drag.start.y),
      })
      return
    }

    const p = toDoc(e)

    switch (drag.kind) {
      case 'marquee':
        setDrag({ ...drag, current: p })
        break

      case 'create':
        setDrag({ ...drag, current: p })
        break

      case 'move': {
        let dx = p.x - drag.start.x
        let dy = p.y - drag.start.y
        if (e.shiftKey) {
          // Constrain to the dominant axis.
          if (Math.abs(dx) > Math.abs(dy)) dy = 0
          else dx = 0
        }
        if (snapEnabled && !e.altKey) {
          const movingBounds = unionOf([...drag.originals.values()])
          if (movingBounds) {
            const moved = { ...movingBounds, x: movingBounds.x + dx, y: movingBounds.y + dy }
            const others = page.elements
              .filter((el) => !selection.includes(el.id) && !el.hidden)
              .map((el) => aabb(elementRect(el), el.rotation))
            const snap = computeSnap(moved, others, doc.settings, SNAP_THRESHOLD_PX / zoom)
            dx += snap.dx
            dy += snap.dy
            setGuides(snap.guides)
          }
        } else {
          setGuides([])
        }
        store.updateElements(
          selection,
          (el) => {
            const o = drag.originals.get(el.id)
            return o ? { x: round(o.x + dx), y: round(o.y + dy) } : {}
          },
          { history: false },
        )
        break
      }

      case 'resize': {
        const keepAspect = e.shiftKey || selection.length > 1
        if (selection.length === 1) {
          const id = selection[0]
          const original = drag.originals.get(id)
          const el = page.elements.find((x) => x.id === id)
          if (!original || !el) break
          const next = resizeRotatedRect(original, el.rotation, drag.handle, p, {
            keepAspect: e.shiftKey,
          })
          store.updateElements(
            [id],
            () => ({ x: round(next.x), y: round(next.y), w: round(next.w), h: round(next.h) }),
            { history: false },
          )
        } else {
          // Scale the whole selection box, then map every element into it.
          const next = resizeRotatedRect(drag.bounds, 0, drag.handle, p, { keepAspect })
          const sx = next.w / drag.bounds.w
          const sy = next.h / drag.bounds.h
          store.updateElements(
            selection,
            (el) => {
              const o = drag.originals.get(el.id)
              if (!o) return {}
              return {
                x: round(next.x + (o.x - drag.bounds.x) * sx),
                y: round(next.y + (o.y - drag.bounds.y) * sy),
                w: round(Math.max(4, o.w * sx)),
                h: round(Math.max(4, o.h * sy)),
              }
            },
            { history: false },
          )
        }
        break
      }

      case 'rotate': {
        const current = angleFrom(drag.center, p)
        let delta = current - drag.startAngle
        if (e.shiftKey) delta = Math.round(delta / 15) * 15
        store.updateElements(
          selection,
          (el) => {
            const original = drag.originals.get(el.id)
            if (!original) return {}
            const rotation = round(normalizeAngle(original.rotation + delta), 1)
            if (selection.length === 1) return { rotation }
            // Rotating a group also orbits each element around the shared centre.
            const c = {
              x: original.rect.x + original.rect.w / 2,
              y: original.rect.y + original.rect.h / 2,
            }
            const orbit = rotateVec({ x: c.x - drag.center.x, y: c.y - drag.center.y }, delta)
            return {
              rotation,
              x: round(drag.center.x + orbit.x - original.rect.w / 2),
              y: round(drag.center.y + orbit.y - original.rect.h / 2),
            }
          },
          { history: false },
        )
        break
      }
    }
  }

  const handlePointerUp = () => {
    const store = useEditor.getState()
    if (drag.kind === 'marquee') {
      const box = normalizeRect(drag.start, drag.current)
      const ids = page.elements
        .filter((el) => !el.hidden && !el.locked)
        .filter((el) => rectsIntersect(box, aabb(elementRect(el), el.rotation)))
        .map((el) => el.id)
      if (ids.length) store.select(ids, drag.additive)
    }

    if (drag.kind === 'create') {
      const box = normalizeRect(drag.start, drag.current)
      const created = createFromTool(tool, box)
      if (created) {
        store.addElements([created])
        if (created.type === 'text') store.setEditingText(created.id)
      }
      store.setTool('select')
    }

    setGuides([])
    setDrag({ kind: 'none' })
  }

  const handleDoubleClick = (e: React.MouseEvent) => {
    const p = toDoc(e)
    const hit = [...page.elements]
      .reverse()
      .find((el) => el.type === 'text' && !el.hidden && !el.locked && hitTest(p, el))
    if (hit) {
      useEditor.getState().select([hit.id])
      useEditor.getState().setEditingText(hit.id)
    }
  }

  const editingElement = editingTextId
    ? (page.elements.find((el) => el.id === editingTextId) as TextElement | undefined)
    : undefined

  const marqueeRect = drag.kind === 'marquee' ? normalizeRect(drag.start, drag.current) : null
  const createRect = drag.kind === 'create' ? normalizeRect(drag.start, drag.current) : null

  return (
    <div
      className="canvas-viewport"
      ref={viewportRef}
      data-tool={tool}
      data-panning={spaceHeld || drag.kind === 'pan' || undefined}
    >
      <div
        className="canvas-stage"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
      >
        <div
          className="canvas-page-wrap"
          ref={pageRef}
          style={{ width: doc.settings.width, height: doc.settings.height }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onDoubleClick={handleDoubleClick}
        >
          <PageView
            page={page}
            settings={doc.settings}
            resolve={resolve}
            editingTextId={editingTextId}
            style={{ boxShadow: '0 24px 80px rgba(0,0,0,.45)' }}
          />

          {showGrid && (
            <div
              className="canvas-grid"
              style={{ backgroundSize: `${doc.settings.width / 12}px ${doc.settings.width / 12}px` }}
            />
          )}

          {/* Selection chrome, drawn in document space so it scales with zoom. */}
          {selectionBounds && drag.kind !== 'marquee' && (
            <SelectionChrome
              bounds={selectionBounds}
              zoom={zoom}
              single={selected.length === 1 ? selected[0] : null}
              onResize={startResize}
              onRotate={startRotate}
            />
          )}

          {selected.length > 1 &&
            selected.map((el) => (
              <div
                key={el.id}
                className="selection-outline"
                style={{
                  left: el.x,
                  top: el.y,
                  width: el.w,
                  height: el.h,
                  transform: `rotate(${el.rotation}deg)`,
                  borderWidth: 1 / zoom,
                }}
              />
            ))}

          {guides.map((g, i) => (
            <div
              key={i}
              className="snap-guide"
              style={
                g.axis === 'x'
                  ? { left: g.at, top: g.from, height: g.to - g.from, width: 1 / zoom }
                  : { top: g.at, left: g.from, width: g.to - g.from, height: 1 / zoom }
              }
            />
          ))}

          {marqueeRect && (
            <div
              className="marquee"
              style={{
                left: marqueeRect.x,
                top: marqueeRect.y,
                width: marqueeRect.w,
                height: marqueeRect.h,
                borderWidth: 1 / zoom,
              }}
            />
          )}

          {createRect && (
            <div
              className="marquee create"
              style={{
                left: createRect.x,
                top: createRect.y,
                width: createRect.w,
                height: createRect.h,
                borderWidth: 2 / zoom,
              }}
            />
          )}

          {editingElement && <InlineTextEditor element={editingElement} />}
        </div>
      </div>

      <ZoomBadge />
    </div>
  )
}

// ---------------------------------------------------------------------------

function SelectionChrome({
  bounds,
  zoom,
  single,
  onResize,
  onRotate,
}: {
  bounds: Rect
  zoom: number
  single: FlipElement | null
  onResize: (h: Handle) => (e: React.PointerEvent) => void
  onRotate: (e: React.PointerEvent) => void
}) {
  // A single element gets its selection box rotated with it.
  const rect = single ? elementRect(single) : bounds
  const rotation = single ? single.rotation : 0
  const s = 1 / zoom

  return (
    <div
      className="selection-box"
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        transform: `rotate(${rotation}deg)`,
        borderWidth: 1.5 * s,
      }}
    >
      {HANDLES.map((h) => (
        <div
          key={h}
          className={`handle handle-${h}`}
          onPointerDown={onResize(h)}
          style={{ width: 10 * s, height: 10 * s, borderWidth: 1.5 * s }}
        />
      ))}
      <div
        className="handle handle-rotate"
        onPointerDown={onRotate}
        style={{ width: 12 * s, height: 12 * s, top: -28 * s, borderWidth: 1.5 * s }}
      />
      <div className="rotate-stem" style={{ height: 22 * s, width: 1.5 * s, top: -22 * s }} />
    </div>
  )
}

function InlineTextEditor({ element }: { element: TextElement }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const patch = useEditor((s) => s.patchElement)
  const setEditing = useEditor((s) => s.setEditingText)
  const [value, setValue] = useState(element.text)
  const committed = useRef(element.text)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.select()
  }, [])

  const commit = () => {
    if (committed.current !== value) {
      patch(element.id, { text: value } as Partial<FlipElement>)
      committed.current = value
    }
    setEditing(null)
  }

  return (
    <textarea
      ref={ref}
      className="inline-text-editor"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape') {
          setValue(committed.current)
          setEditing(null)
        }
      }}
      style={{
        position: 'absolute',
        left: element.x,
        top: element.y,
        width: element.w,
        height: element.h,
        transform: `rotate(${element.rotation}deg)`,
        ...(textStyle(element) as React.CSSProperties),
        display: 'block',
      }}
    />
  )
}

function ZoomBadge() {
  const zoom = useEditor((s) => s.zoom)
  const setZoom = useEditor((s) => s.setZoom)
  return (
    <div className="zoom-badge">
      <button onClick={() => setZoom(zoom / 1.2)} title="Zoom out">
        –
      </button>
      <span>{Math.round(zoom * 100)}%</span>
      <button onClick={() => setZoom(zoom * 1.2)} title="Zoom in">
        +
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------

function snapshot(elements: FlipElement[], ids: string[]): Map<string, Rect> {
  const map = new Map<string, Rect>()
  for (const el of elements) if (ids.includes(el.id)) map.set(el.id, elementRect(el))
  return map
}

function unionOf(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null
  const minX = Math.min(...rects.map((r) => r.x))
  const minY = Math.min(...rects.map((r) => r.y))
  const maxX = Math.max(...rects.map((r) => r.x + r.w))
  const maxY = Math.max(...rects.map((r) => r.y + r.h))
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

function normalizeRect(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  }
}

function normalizeAngle(deg: number): number {
  return ((deg % 360) + 360) % 360
}

function createFromTool(tool: string, box: Rect): FlipElement | null {
  const w = Math.max(box.w, 40)
  const h = Math.max(box.h, 40)
  switch (tool) {
    case 'text':
      return createText({ x: box.x, y: box.y, w: Math.max(box.w, 240), h: Math.max(box.h, 90) })
    case 'rect':
      return createShape('rect', { x: box.x, y: box.y, w, h })
    case 'ellipse':
      return createShape('ellipse', { x: box.x, y: box.y, w, h })
    case 'line':
      return createLine({ x: box.x, y: box.y, w: Math.max(box.w, 80), h: 24 })
    default:
      return null
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable
  )
}
