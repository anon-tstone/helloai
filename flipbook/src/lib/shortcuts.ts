import { useEffect } from 'react'
import { useEditor } from '../store/editor'

/** Keyboard shortcuts, ignored while typing in a field. */
export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      if (typing) return

      const store = useEditor.getState()
      const mod = e.metaKey || e.ctrlKey

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) store.redo()
        else store.undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        store.redo()
        return
      }
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        store.selectAll()
        return
      }
      if (mod && e.key.toLowerCase() === 'c') {
        store.copySelection()
        return
      }
      if (mod && e.key.toLowerCase() === 'v') {
        store.pasteClipboard()
        return
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        store.duplicateSelection()
        return
      }
      if (mod && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        if (e.shiftKey) store.ungroup()
        else store.group()
        return
      }
      if (mod && e.key === ']') {
        e.preventDefault()
        store.bringForward(store.selection)
        return
      }
      if (mod && e.key === '[') {
        e.preventDefault()
        store.sendBackward(store.selection)
        return
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (store.selection.length) {
          e.preventDefault()
          store.removeElements(store.selection)
        }
        return
      }
      if (e.key === 'Escape') {
        store.clearSelection()
        store.setTool('select')
        return
      }
      if (e.key === 'Enter' && store.selection.length === 1) {
        const page = store.doc.pages[store.pageIndex]
        const el = page?.elements.find((x) => x.id === store.selection[0])
        if (el?.type === 'text') {
          e.preventDefault()
          store.setEditingText(el.id)
        }
        return
      }

      // Arrow-key nudging: 1px, or 10px with shift.
      if (e.key.startsWith('Arrow') && store.selection.length) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        store.updateElements(store.selection, (el) => ({ x: el.x + dx, y: el.y + dy }))
        return
      }

      if (!mod) {
        const toolKeys: Record<string, string> = {
          v: 'select',
          h: 'hand',
          t: 'text',
          r: 'rect',
          o: 'ellipse',
          l: 'line',
        }
        const tool = toolKeys[e.key.toLowerCase()]
        if (tool) store.setTool(tool as never)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
