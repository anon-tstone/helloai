import { useState } from 'react'
import { useEditor } from '../store/editor'
import {
  buildOfflineBundle,
  collectUsedAssets,
  downloadBlob,
  type ExportMode,
} from '../export/exportBundle'

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const doc = useEditor((s) => s.doc)
  const [mode, setMode] = useState<ExportMode>('zip')
  const [embedFonts, setEmbedFonts] = useState(true)
  const [includeSource, setIncludeSource] = useState(true)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ step: string; ratio: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ filename: string; bytes: number } | null>(null)

  const assetCount = collectUsedAssets(doc).length

  const run = async () => {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const bundle = await buildOfflineBundle(doc, {
        mode,
        embedFonts,
        includeSource,
        onProgress: (step, ratio) => setProgress({ step, ratio }),
      })
      downloadBlob(bundle.blob, bundle.filename)
      setResult({ filename: bundle.filename, bytes: bundle.bytes })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Export offline build</h2>
          <button className="icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <p className="hint">
          Builds a self-contained flipbook that runs with no server and no internet —
          double-click <code>index.html</code> and it works.
        </p>

        <div className="export-modes">
          <label className={mode === 'zip' ? 'selected' : ''}>
            <input
              type="radio"
              checked={mode === 'zip'}
              onChange={() => setMode('zip')}
              name="mode"
            />
            <strong>ZIP folder</strong>
            <span>index.html + assets/ — best for large books and USB handoff.</span>
          </label>
          <label className={mode === 'single-file' ? 'selected' : ''}>
            <input
              type="radio"
              checked={mode === 'single-file'}
              onChange={() => setMode('single-file')}
              name="mode"
            />
            <strong>Single HTML file</strong>
            <span>Everything inlined into one file — easiest to email or share.</span>
          </label>
        </div>

        <label className="field inline">
          <input
            type="checkbox"
            checked={embedFonts}
            onChange={(e) => setEmbedFonts(e.target.checked)}
          />
          <span>Embed fonts (downloads webfonts now so text renders identically offline)</span>
        </label>
        {mode === 'zip' && (
          <label className="field inline">
            <input
              type="checkbox"
              checked={includeSource}
              onChange={(e) => setIncludeSource(e.target.checked)}
            />
            <span>Include flipbook.json so the book can be re-imported later</span>
          </label>
        )}

        <dl className="export-summary">
          <div>
            <dt>Pages</dt>
            <dd>{doc.pages.length}</dd>
          </div>
          <div>
            <dt>Assets</dt>
            <dd>{assetCount}</dd>
          </div>
          <div>
            <dt>Page size</dt>
            <dd>
              {doc.settings.width} × {doc.settings.height}
            </dd>
          </div>
        </dl>

        {progress && (
          <div className="progress">
            <div className="bar" style={{ width: `${Math.round(progress.ratio * 100)}%` }} />
            <span>{progress.step}</span>
          </div>
        )}
        {error && <p className="hint warn">{error}</p>}
        {result && (
          <p className="hint ok">
            Built {result.filename} ({formatBytes(result.bytes)}) — check your downloads.
          </p>
        )}

        <footer>
          <button onClick={onClose}>Close</button>
          <button className="primary" onClick={run} disabled={busy}>
            {busy ? 'Building…' : 'Build offline flipbook'}
          </button>
        </footer>
      </div>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
