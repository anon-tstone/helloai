import { useState } from 'react'
import { useEditor } from '../store/editor'
import { api } from '../lib/api'
import type { Tool } from '../store/editor'

const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: 'select', label: '⌖', hint: 'Select (V)' },
  { id: 'hand', label: '✋', hint: 'Pan (H, or hold space)' },
  { id: 'text', label: 'T', hint: 'Text (T)' },
  { id: 'rect', label: '▭', hint: 'Rectangle (R)' },
  { id: 'ellipse', label: '◯', hint: 'Ellipse (O)' },
  { id: 'line', label: '／', hint: 'Line (L)' },
]

export function TopBar({
  onPreview,
  onExport,
}: {
  onPreview: () => void
  onExport: () => void
}) {
  const title = useEditor((s) => s.doc.title)
  const setTitle = useEditor((s) => s.setTitle)
  const tool = useEditor((s) => s.tool)
  const setTool = useEditor((s) => s.setTool)
  const undo = useEditor((s) => s.undo)
  const redo = useEditor((s) => s.redo)
  const canUndo = useEditor((s) => s.past.length > 0)
  const canRedo = useEditor((s) => s.future.length > 0)
  const saveState = useEditor((s) => s.saveState)
  const selection = useEditor((s) => s.selection)
  const snapEnabled = useEditor((s) => s.snapEnabled)
  const showGrid = useEditor((s) => s.showGrid)

  const hasSelection = selection.length > 0

  return (
    <header className="top-bar">
      <div className="brand">
        <span className="logo">◪</span>
        <span>Flipbook Studio</span>
      </div>

      <input
        className="doc-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Document title"
      />

      <div className="toolbar">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={tool === t.id ? 'active' : ''}
            title={t.hint}
            onClick={() => setTool(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="toolbar">
        <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
          ↶
        </button>
        <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
          ↷
        </button>
      </div>

      <div className="toolbar" data-disabled={!hasSelection || undefined}>
        <AlignButtons />
      </div>

      <div className="toolbar">
        <button
          className={snapEnabled ? 'active' : ''}
          onClick={() => useEditor.getState().toggleSnap()}
          title="Smart guides"
        >
          ⌗
        </button>
        <button
          className={showGrid ? 'active' : ''}
          onClick={() => useEditor.getState().toggleGrid()}
          title="Grid"
        >
          ▦
        </button>
      </div>

      <span className="spacer" />

      <SaveBadge state={saveState} />
      <ShareButton />
      <button onClick={onPreview}>Preview</button>
      <button className="primary" onClick={onExport}>
        Export offline
      </button>
    </header>
  )
}

function AlignButtons() {
  const align = useEditor((s) => s.align)
  const distribute = useEditor((s) => s.distribute)
  const store = useEditor
  return (
    <>
      <button onClick={() => align('left')} title="Align left">
        ⇤
      </button>
      <button onClick={() => align('hcenter')} title="Centre horizontally">
        ↔
      </button>
      <button onClick={() => align('right')} title="Align right">
        ⇥
      </button>
      <button onClick={() => align('top')} title="Align top">
        ⤒
      </button>
      <button onClick={() => align('vcenter')} title="Centre vertically">
        ↕
      </button>
      <button onClick={() => align('bottom')} title="Align bottom">
        ⤓
      </button>
      <button onClick={() => distribute('h')} title="Distribute horizontally">
        ≡
      </button>
      <button
        onClick={() => store.getState().bringToFront(store.getState().selection)}
        title="Bring to front"
      >
        ⤴
      </button>
      <button
        onClick={() => store.getState().sendToBack(store.getState().selection)}
        title="Send to back"
      >
        ⤵
      </button>
      <button onClick={() => store.getState().group()} title="Group (Ctrl+G)">
        ⧉
      </button>
      <button onClick={() => store.getState().ungroup()} title="Ungroup (Ctrl+Shift+G)">
        ⧈
      </button>
    </>
  )
}

function SaveBadge({ state }: { state: string }) {
  const label: Record<string, string> = {
    idle: 'Ready',
    dirty: 'Unsaved changes',
    saving: 'Saving…',
    saved: 'All changes saved',
    offline: 'Saved on this device',
    error: 'Save failed',
  }
  return (
    <span className={`save-badge ${state}`} title={label[state] ?? state}>
      {label[state] ?? state}
    </span>
  )
}

function ShareButton() {
  const projectId = useEditor((s) => s.projectId)
  const [busy, setBusy] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const publish = async () => {
    if (!projectId) {
      setError('Save the project first — it publishes automatically once saved.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { url } = await api.publish(projectId)
      const absolute = new URL(url, window.location.origin).toString()
      setShareUrl(absolute)
      await navigator.clipboard?.writeText(absolute).catch(() => undefined)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="share-wrap">
      <button onClick={publish} disabled={busy}>
        {busy ? 'Publishing…' : 'Share'}
      </button>
      {shareUrl && (
        <a className="share-link" href={shareUrl} target="_blank" rel="noreferrer">
          Link copied — open
        </a>
      )}
      {error && <span className="share-error">{error}</span>}
    </span>
  )
}
