import { useEffect, useRef } from 'react'
import type { FlipDoc } from '../shared/types'
import { useEditor } from '../store/editor'
import { api } from './api'

const LOCAL_DOC_KEY = 'flipbook-studio:doc'
const LOCAL_PROJECT_KEY = 'flipbook-studio:project'
const AUTOSAVE_DELAY_MS = 1200

export function saveLocal(doc: FlipDoc, projectId: string | null) {
  try {
    localStorage.setItem(LOCAL_DOC_KEY, JSON.stringify(doc))
    if (projectId) localStorage.setItem(LOCAL_PROJECT_KEY, projectId)
  } catch {
    // Quota exceeded or storage disabled — autosave to the server still works.
  }
}

export function loadLocal(): { doc: FlipDoc; projectId: string | null } | null {
  try {
    const raw = localStorage.getItem(LOCAL_DOC_KEY)
    if (!raw) return null
    return { doc: JSON.parse(raw) as FlipDoc, projectId: localStorage.getItem(LOCAL_PROJECT_KEY) }
  } catch {
    return null
  }
}

export function clearLocal() {
  localStorage.removeItem(LOCAL_DOC_KEY)
  localStorage.removeItem(LOCAL_PROJECT_KEY)
}

/**
 * Debounced autosave.
 *
 * The server (D1) is the source of truth, but the editor keeps working when the
 * API is unreachable: the document is mirrored to localStorage and the status
 * shows "offline" until the next successful save.
 */
export function useAutosave() {
  const doc = useEditor((s) => s.doc)
  const saveState = useEditor((s) => s.saveState)
  const timer = useRef<number | null>(null)
  const inFlight = useRef(false)

  useEffect(() => {
    if (saveState !== 'dirty') return
    if (timer.current) window.clearTimeout(timer.current)

    timer.current = window.setTimeout(async () => {
      if (inFlight.current) return
      inFlight.current = true
      const store = useEditor.getState()
      const current = store.doc
      saveLocal(current, store.projectId)
      store.setSaveState('saving')
      try {
        if (store.projectId) {
          await api.saveProject(store.projectId, current)
        } else {
          const { id } = await api.createProject(current)
          store.setProjectId(id)
          const url = new URL(window.location.href)
          url.searchParams.set('project', id)
          window.history.replaceState({}, '', url)
        }
        // Only mark clean if nothing changed while the request was in flight.
        if (useEditor.getState().doc === current) store.setSaveState('saved')
      } catch (err) {
        store.setSaveState('offline', err instanceof Error ? err.message : String(err))
      } finally {
        inFlight.current = false
      }
    }, AUTOSAVE_DELAY_MS)

    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [doc, saveState])
}
