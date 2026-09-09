import { useEffect, useState } from 'react'
import { Canvas } from './components/Canvas'
import { LeftPanel } from './components/LeftPanel'
import { PagesPanel } from './components/PagesPanel'
import { RightPanel } from './components/RightPanel'
import { TopBar } from './components/TopBar'
import { Reader } from './components/Reader'
import { ExportDialog } from './components/ExportDialog'
import { useEditor } from './store/editor'
import { useShortcuts } from './lib/shortcuts'
import { loadLocal, useAutosave } from './lib/persistence'
import { api } from './lib/api'

export function App() {
  const doc = useEditor((s) => s.doc)
  const loadDoc = useEditor((s) => s.loadDoc)
  const [preview, setPreview] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [booted, setBooted] = useState(false)

  useShortcuts()
  useAutosave()

  // Restore the project named in the URL, else the last local draft.
  useEffect(() => {
    let cancelled = false
    const boot = async () => {
      const projectId = new URLSearchParams(window.location.search).get('project')
      if (projectId) {
        try {
          const { doc: remote } = await api.getProject(projectId)
          if (!cancelled) loadDoc(remote, projectId)
          return
        } catch {
          // Fall through to the local draft below.
        }
      }
      const local = loadLocal()
      if (local && !cancelled) loadDoc(local.doc, local.projectId)
    }
    void boot().finally(() => !cancelled && setBooted(true))
    return () => {
      cancelled = true
    }
  }, [loadDoc])

  // Warn before losing unsaved work.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (useEditor.getState().saveState === 'dirty') e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  if (!booted) {
    return (
      <div className="boot">
        <span className="logo">◪</span>
        <p>Loading Flipbook Studio…</p>
      </div>
    )
  }

  return (
    <div className="app">
      <TopBar onPreview={() => setPreview(true)} onExport={() => setExporting(true)} />
      <div className="workspace">
        <LeftPanel />
        <main className="stage-area">
          <Canvas />
          <PagesPanel />
        </main>
        <RightPanel />
      </div>

      {preview && (
        <div className="overlay">
          <Reader doc={doc} onClose={() => setPreview(false)} />
        </div>
      )}
      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
    </div>
  )
}
