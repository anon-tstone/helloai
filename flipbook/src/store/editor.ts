import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import type {
  AssetRef,
  DocSettings,
  FlipDoc,
  FlipElement,
  FlipPage,
  PageBackground,
} from '../shared/types'
import { cloneElements, clonePage, createDoc, createPage, newId } from '../lib/factory'
import { findTheme, remapBackground, themeRemap, type FlipTheme } from '../lib/themes'
import { aabb, boundsOf, elementRect, type Rect } from '../lib/geometry'

const HISTORY_LIMIT = 100

export type Tool = 'select' | 'hand' | 'text' | 'rect' | 'ellipse' | 'line'
export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'offline'

export interface EditorState {
  doc: FlipDoc
  /** Server project id; null until the document has been saved once. */
  projectId: string | null
  pageIndex: number
  selection: string[]
  editingTextId: string | null
  tool: Tool
  zoom: number
  pan: { x: number; y: number }
  showGrid: boolean
  snapEnabled: boolean
  past: FlipDoc[]
  future: FlipDoc[]
  clipboard: FlipElement[]
  saveState: SaveState
  lastError: string | null

  // -- document -------------------------------------------------------------
  loadDoc: (doc: FlipDoc, projectId?: string | null) => void
  setTitle: (title: string) => void
  updateSettings: (patch: Partial<DocSettings>) => void
  registerAsset: (asset: AssetRef) => void
  /**
   * Restyle the whole book. `recolorContents` also remaps element colours and
   * fonts that still match the outgoing theme, leaving hand-picked ones alone.
   */
  applyTheme: (theme: FlipTheme, opts?: { recolorContents?: boolean }) => void

  // -- history --------------------------------------------------------------
  /** Push the current document onto the undo stack (call before a drag). */
  pushHistory: () => void
  undo: () => void
  redo: () => void

  // -- pages ----------------------------------------------------------------
  setPageIndex: (index: number) => void
  addPage: (afterIndex?: number) => void
  duplicatePage: (index: number) => void
  deletePage: (index: number) => void
  movePage: (from: number, to: number) => void
  renamePage: (index: number, name: string) => void
  setPageBackground: (index: number, patch: Partial<PageBackground>) => void

  // -- elements -------------------------------------------------------------
  addElements: (elements: FlipElement[], opts?: { select?: boolean }) => void
  updateElements: (
    ids: string[],
    patch: (el: FlipElement) => Partial<FlipElement>,
    opts?: { history?: boolean },
  ) => void
  patchElement: (id: string, patch: Partial<FlipElement>, opts?: { history?: boolean }) => void
  removeElements: (ids: string[]) => void
  duplicateSelection: () => void
  copySelection: () => void
  pasteClipboard: () => void

  // -- selection ------------------------------------------------------------
  select: (ids: string[], additive?: boolean) => void
  selectAll: () => void
  clearSelection: () => void
  setEditingText: (id: string | null) => void

  // -- ordering & grouping --------------------------------------------------
  reorder: (id: string, toIndex: number) => void
  bringForward: (ids: string[]) => void
  sendBackward: (ids: string[]) => void
  bringToFront: (ids: string[]) => void
  sendToBack: (ids: string[]) => void
  group: () => void
  ungroup: () => void

  // -- alignment ------------------------------------------------------------
  align: (mode: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') => void
  distribute: (axis: 'h' | 'v') => void

  // -- viewport -------------------------------------------------------------
  setTool: (tool: Tool) => void
  /** Anchored zooming lives in the canvas, which knows the viewport geometry. */
  setZoom: (zoom: number) => void
  setPan: (pan: { x: number; y: number }) => void
  zoomToFit: (viewport: { width: number; height: number }) => void
  toggleGrid: () => void
  toggleSnap: () => void

  // -- persistence ----------------------------------------------------------
  setSaveState: (state: SaveState, error?: string | null) => void
  setProjectId: (id: string | null) => void
}

function touch(doc: FlipDoc): FlipDoc {
  return { ...doc, updatedAt: Date.now() }
}

export const useEditor = create<EditorState>((set, get) => {
  /**
   * Apply a mutation to the document. By default the previous document is
   * pushed onto the undo stack; pass `history: false` for the intermediate
   * frames of a drag (the caller calls `pushHistory()` once when it starts).
   */
  const mutate = (fn: (doc: FlipDoc) => FlipDoc, history = true) => {
    set((s) => {
      const next = touch(fn(structuredClone(s.doc)))
      return {
        doc: next,
        past: history ? [...s.past, s.doc].slice(-HISTORY_LIMIT) : s.past,
        future: history ? [] : s.future,
        saveState: 'dirty' as SaveState,
      }
    })
  }

  const currentPage = (doc: FlipDoc, index: number): FlipPage => doc.pages[index]

  /** Expand a selection so that picking one grouped element picks the group. */
  const expandGroups = (page: FlipPage, ids: string[]): string[] => {
    const groups = new Set(
      page.elements.filter((e) => ids.includes(e.id) && e.groupId).map((e) => e.groupId!),
    )
    if (groups.size === 0) return ids
    const out = new Set(ids)
    for (const el of page.elements) {
      if (el.groupId && groups.has(el.groupId)) out.add(el.id)
    }
    return [...out]
  }

  const selectedElements = (): FlipElement[] => {
    const { doc, pageIndex, selection } = get()
    const page = doc.pages[pageIndex]
    if (!page) return []
    return page.elements.filter((e) => selection.includes(e.id))
  }

  return {
    doc: createDoc(),
    projectId: null,
    pageIndex: 0,
    selection: [],
    editingTextId: null,
    tool: 'select',
    zoom: 0.35,
    pan: { x: 0, y: 0 },
    showGrid: false,
    snapEnabled: true,
    past: [],
    future: [],
    clipboard: [],
    saveState: 'idle',
    lastError: null,

    loadDoc: (doc, projectId = null) =>
      set({
        doc,
        projectId,
        pageIndex: 0,
        selection: [],
        editingTextId: null,
        past: [],
        future: [],
        saveState: 'saved',
      }),

    setTitle: (title) => mutate((d) => ({ ...d, title })),

    updateSettings: (patch) => mutate((d) => ({ ...d, settings: { ...d.settings, ...patch } })),

    registerAsset: (asset) =>
      mutate((d) => ({ ...d, assets: { ...d.assets, [asset.id]: asset } }), false),

    applyTheme: (theme, opts) => {
      const recolor = opts?.recolorContents ?? true
      mutate((d) => {
        const previous = findTheme(d.settings.themeId)
        const { colors, fonts } = themeRemap(previous, theme)

        const restyle = (el: FlipElement): FlipElement => {
          if (!recolor) return el
          const next = { ...el }
          switch (next.type) {
            case 'text': {
              const mapped = colors.get(next.color.toLowerCase())
              if (mapped) next.color = mapped
              const font = fonts.get(next.fontFamily)
              if (font) next.fontFamily = font
              break
            }
            case 'shape': {
              if (next.fill.kind === 'solid') {
                const mapped = colors.get(next.fill.color.toLowerCase())
                if (mapped) next.fill = { ...next.fill, color: mapped }
              } else if (next.fill.kind === 'linear') {
                const from = colors.get(next.fill.from.toLowerCase())
                const to = colors.get(next.fill.to.toLowerCase())
                if (from || to) {
                  next.fill = {
                    ...next.fill,
                    from: from ?? next.fill.from,
                    to: to ?? next.fill.to,
                  }
                }
              }
              const stroke = colors.get(next.stroke.toLowerCase())
              if (stroke) next.stroke = stroke
              break
            }
            case 'line': {
              const mapped = colors.get(next.stroke.toLowerCase())
              if (mapped) next.stroke = mapped
              break
            }
            default:
              break
          }
          return next
        }

        return {
          ...d,
          settings: {
            ...d.settings,
            themeId: theme.id,
            backgroundColor: theme.viewerBackground,
            // A backdrop image the author chose survives the theme change.
            viewerBackground: {
              fill: { kind: 'solid', color: theme.viewerBackground },
              ...(d.settings.viewerBackground?.image
                ? { image: d.settings.viewerBackground.image }
                : {}),
            },
            flipStyle: theme.flipStyle,
            // A custom paper tile is the author's choice; themes don't take it.
            paper:
              d.settings.paper?.kind === 'custom'
                ? d.settings.paper
                : structuredClone(theme.paper),
          },
          pages: d.pages.map((page) => ({
            ...page,
            // Body, cover and tinted pages each move to the matching surface in
            // the new theme; a background the author chose is left alone.
            background: remapBackground(page.background, previous, theme),
            elements: page.elements.map(restyle),
          })),
        }
      })
    },

    pushHistory: () =>
      set((s) => ({ past: [...s.past, s.doc].slice(-HISTORY_LIMIT), future: [] })),

    undo: () =>
      set((s) => {
        if (s.past.length === 0) return s
        const previous = s.past[s.past.length - 1]
        return {
          doc: previous,
          past: s.past.slice(0, -1),
          future: [s.doc, ...s.future].slice(0, HISTORY_LIMIT),
          pageIndex: Math.min(s.pageIndex, previous.pages.length - 1),
          selection: [],
          editingTextId: null,
          saveState: 'dirty',
        }
      }),

    redo: () =>
      set((s) => {
        if (s.future.length === 0) return s
        const next = s.future[0]
        return {
          doc: next,
          past: [...s.past, s.doc].slice(-HISTORY_LIMIT),
          future: s.future.slice(1),
          pageIndex: Math.min(s.pageIndex, next.pages.length - 1),
          selection: [],
          editingTextId: null,
          saveState: 'dirty',
        }
      }),

    setPageIndex: (index) =>
      set((s) => ({
        pageIndex: Math.max(0, Math.min(index, s.doc.pages.length - 1)),
        selection: [],
        editingTextId: null,
      })),

    addPage: (afterIndex) => {
      const at = afterIndex ?? get().pageIndex
      mutate((d) => {
        const pages = [...d.pages]
        pages.splice(at + 1, 0, createPage({ name: `Page ${pages.length + 1}` }))
        return { ...d, pages }
      })
      set({ pageIndex: at + 1, selection: [] })
    },

    duplicatePage: (index) => {
      mutate((d) => {
        const pages = [...d.pages]
        pages.splice(index + 1, 0, clonePage(pages[index]))
        return { ...d, pages }
      })
      set({ pageIndex: index + 1, selection: [] })
    },

    deletePage: (index) => {
      if (get().doc.pages.length <= 1) return
      mutate((d) => ({ ...d, pages: d.pages.filter((_, i) => i !== index) }))
      set((s) => ({
        pageIndex: Math.max(0, Math.min(index, s.doc.pages.length - 1)),
        selection: [],
      }))
    },

    movePage: (from, to) => {
      mutate((d) => {
        const pages = [...d.pages]
        const [moved] = pages.splice(from, 1)
        pages.splice(to, 0, moved)
        return { ...d, pages }
      })
      set({ pageIndex: to, selection: [] })
    },

    renamePage: (index, name) =>
      mutate((d) => ({
        ...d,
        pages: d.pages.map((p, i) => (i === index ? { ...p, name } : p)),
      })),

    setPageBackground: (index, patch) =>
      mutate((d) => ({
        ...d,
        pages: d.pages.map((p, i) =>
          i === index ? { ...p, background: { ...p.background, ...patch } } : p,
        ),
      })),

    addElements: (elements, opts) => {
      const index = get().pageIndex
      mutate((d) => ({
        ...d,
        pages: d.pages.map((p, i) =>
          i === index ? { ...p, elements: [...p.elements, ...elements] } : p,
        ),
      }))
      if (opts?.select !== false) set({ selection: elements.map((e) => e.id) })
    },

    updateElements: (ids, patch, opts) => {
      const index = get().pageIndex
      mutate(
        (d) => ({
          ...d,
          pages: d.pages.map((p, i) =>
            i === index
              ? {
                  ...p,
                  elements: p.elements.map((el) =>
                    ids.includes(el.id) ? ({ ...el, ...patch(el) } as FlipElement) : el,
                  ),
                }
              : p,
          ),
        }),
        opts?.history ?? true,
      )
    },

    patchElement: (id, patch, opts) => get().updateElements([id], () => patch, opts),

    removeElements: (ids) => {
      const index = get().pageIndex
      mutate((d) => ({
        ...d,
        pages: d.pages.map((p, i) =>
          i === index ? { ...p, elements: p.elements.filter((el) => !ids.includes(el.id)) } : p,
        ),
      }))
      set((s) => ({ selection: s.selection.filter((id) => !ids.includes(id)) }))
    },

    duplicateSelection: () => {
      const copies = cloneElements(selectedElements()).map((el) => ({
        ...el,
        x: el.x + 24,
        y: el.y + 24,
      }))
      if (copies.length === 0) return
      get().addElements(copies)
    },

    copySelection: () => set({ clipboard: structuredClone(selectedElements()) }),

    pasteClipboard: () => {
      const { clipboard } = get()
      if (clipboard.length === 0) return
      const copies = cloneElements(clipboard).map((el) => ({
        ...el,
        x: el.x + 32,
        y: el.y + 32,
      }))
      get().addElements(copies)
    },

    select: (ids, additive = false) =>
      set((s) => {
        const page = currentPage(s.doc, s.pageIndex)
        if (!page) return s
        const base = additive ? [...new Set([...s.selection, ...ids])] : ids
        return { selection: expandGroups(page, base), editingTextId: null }
      }),

    selectAll: () =>
      set((s) => {
        const page = currentPage(s.doc, s.pageIndex)
        if (!page) return s
        return { selection: page.elements.filter((e) => !e.locked).map((e) => e.id) }
      }),

    clearSelection: () => set({ selection: [], editingTextId: null }),

    setEditingText: (id) => set({ editingTextId: id }),

    reorder: (id, toIndex) => {
      const index = get().pageIndex
      mutate((d) => ({
        ...d,
        pages: d.pages.map((p, i) => {
          if (i !== index) return p
          const elements = [...p.elements]
          const from = elements.findIndex((e) => e.id === id)
          if (from < 0) return p
          const [moved] = elements.splice(from, 1)
          elements.splice(Math.max(0, Math.min(toIndex, elements.length)), 0, moved)
          return { ...p, elements }
        }),
      }))
    },

    bringForward: (ids) => shiftOrder(mutate, get, ids, 1),
    sendBackward: (ids) => shiftOrder(mutate, get, ids, -1),

    bringToFront: (ids) => {
      const index = get().pageIndex
      mutate((d) => ({
        ...d,
        pages: d.pages.map((p, i) =>
          i === index
            ? {
                ...p,
                elements: [
                  ...p.elements.filter((e) => !ids.includes(e.id)),
                  ...p.elements.filter((e) => ids.includes(e.id)),
                ],
              }
            : p,
        ),
      }))
    },

    sendToBack: (ids) => {
      const index = get().pageIndex
      mutate((d) => ({
        ...d,
        pages: d.pages.map((p, i) =>
          i === index
            ? {
                ...p,
                elements: [
                  ...p.elements.filter((e) => ids.includes(e.id)),
                  ...p.elements.filter((e) => !ids.includes(e.id)),
                ],
              }
            : p,
        ),
      }))
    },

    group: () => {
      const ids = get().selection
      if (ids.length < 2) return
      const groupId = newId()
      get().updateElements(ids, () => ({ groupId }))
    },

    ungroup: () => {
      const ids = get().selection
      if (ids.length === 0) return
      get().updateElements(ids, () => ({ groupId: null }))
    },

    align: (mode) => {
      const els = selectedElements()
      if (els.length === 0) return
      const { doc, pageIndex } = get()
      const page = doc.pages[pageIndex]
      // A single element aligns to the page; several align to their own bounds.
      const target: Rect =
        els.length === 1
          ? { x: 0, y: 0, w: doc.settings.width, h: doc.settings.height }
          : (boundsOf(els) as Rect)
      void page
      get().updateElements(
        els.map((e) => e.id),
        (el) => {
          const box = aabb(elementRect(el), el.rotation)
          const offsetX = el.x - box.x
          const offsetY = el.y - box.y
          switch (mode) {
            case 'left':
              return { x: target.x + offsetX }
            case 'right':
              return { x: target.x + target.w - box.w + offsetX }
            case 'hcenter':
              return { x: target.x + (target.w - box.w) / 2 + offsetX }
            case 'top':
              return { y: target.y + offsetY }
            case 'bottom':
              return { y: target.y + target.h - box.h + offsetY }
            case 'vcenter':
              return { y: target.y + (target.h - box.h) / 2 + offsetY }
          }
        },
      )
    },

    distribute: (axis) => {
      const els = selectedElements()
      if (els.length < 3) return
      const sorted = [...els].sort((a, b) => (axis === 'h' ? a.x - b.x : a.y - b.y))
      const first = sorted[0]
      const last = sorted[sorted.length - 1]
      const start = axis === 'h' ? first.x + first.w : first.y + first.h
      const end = axis === 'h' ? last.x : last.y
      const inner = sorted.slice(1, -1)
      const totalSize = inner.reduce((sum, el) => sum + (axis === 'h' ? el.w : el.h), 0)
      const gap = (end - start - totalSize) / (inner.length + 1)
      let cursor = start + gap
      const positions = new Map<string, number>()
      for (const el of inner) {
        positions.set(el.id, cursor)
        cursor += (axis === 'h' ? el.w : el.h) + gap
      }
      get().updateElements(
        inner.map((e) => e.id),
        (el) => (axis === 'h' ? { x: positions.get(el.id)! } : { y: positions.get(el.id)! }),
      )
    },

    setTool: (tool) => set({ tool }),

    setZoom: (zoom) => set({ zoom: Math.max(0.05, Math.min(5, zoom)) }),

    setPan: (pan) => set({ pan }),

    zoomToFit: (viewport) => {
      const { doc } = get()
      const spread = doc.settings.spread === 'double' ? 2 : 1
      const docW = doc.settings.width * spread
      const docH = doc.settings.height
      const zoom = Math.min((viewport.width - 120) / docW, (viewport.height - 120) / docH)
      set({ zoom: Math.max(0.05, Math.min(3, zoom)), pan: { x: 0, y: 0 } })
    },

    toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
    toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),

    setSaveState: (state, error = null) => set({ saveState: state, lastError: error }),
    setProjectId: (id) => set({ projectId: id }),
  }
})

/** Move the given ids one step up (`delta` 1) or down (`delta` -1) in z-order. */
function shiftOrder(
  mutate: (fn: (doc: FlipDoc) => FlipDoc, history?: boolean) => void,
  get: () => EditorState,
  ids: string[],
  delta: number,
) {
  const index = get().pageIndex
  mutate((d) => ({
    ...d,
    pages: d.pages.map((p, i) => {
      if (i !== index) return p
      const elements = [...p.elements]
      const order = delta > 0 ? [...elements.keys()].reverse() : [...elements.keys()]
      for (const idx of order) {
        if (!ids.includes(elements[idx].id)) continue
        const target = idx + delta
        if (target < 0 || target >= elements.length) continue
        if (ids.includes(elements[target].id)) continue
        ;[elements[idx], elements[target]] = [elements[target], elements[idx]]
      }
      return { ...p, elements }
    }),
  }))
}

/** Convenience selector: the page currently open in the editor. */
export function useCurrentPage(): FlipPage | undefined {
  return useEditor((s) => s.doc.pages[s.pageIndex])
}

/**
 * Convenience selector: the elements currently selected.
 *
 * The selector builds a new array on every read, so it is compared shallowly —
 * otherwise `useSyncExternalStore` would see a change on every render.
 */
export function useSelectedElements(): FlipElement[] {
  return useEditor(
    useShallow((s) => {
      const page = s.doc.pages[s.pageIndex]
      if (!page) return []
      return page.elements.filter((e) => s.selection.includes(e.id))
    }),
  )
}
