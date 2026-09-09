import { useRef, useState } from 'react'
import { useEditor } from '../store/editor'
import { createImage, createLine, createShape, createText } from '../lib/factory'
import type { ShapeKind } from '../shared/types'
import { PAGE_TEMPLATES } from '../lib/templates'
import { api } from '../lib/api'
import { shapePath } from '../lib/style'

type Tab = 'design' | 'elements' | 'text' | 'uploads' | 'background'

const SHAPES: ShapeKind[] = [
  'rect',
  'ellipse',
  'triangle',
  'diamond',
  'pentagon',
  'hexagon',
  'star',
  'heart',
  'arrow',
  'speech',
]

const TEXT_PRESETS = [
  { label: 'Add a heading', size: 96, weight: 900 },
  { label: 'Add a subheading', size: 56, weight: 700 },
  { label: 'Add body text', size: 32, weight: 400 },
  { label: 'Add a caption', size: 22, weight: 400 },
]

const PALETTE = [
  '#ffffff', '#f4f2ff', '#111318', '#3a3f4b', '#6c5ce7', '#8e7bff',
  '#00b894', '#0984e3', '#fdcb6e', '#e17055', '#d63031', '#e84393',
]

export function LeftPanel() {
  const [tab, setTab] = useState<Tab>('design')

  return (
    <aside className="left-panel">
      <nav className="left-tabs">
        {(['design', 'elements', 'text', 'uploads', 'background'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>
      <div className="left-body">
        {tab === 'design' && <DesignTab />}
        {tab === 'elements' && <ElementsTab />}
        {tab === 'text' && <TextTab />}
        {tab === 'uploads' && <UploadsTab />}
        {tab === 'background' && <BackgroundTab />}
      </div>
    </aside>
  )
}

function DesignTab() {
  const settings = useEditor((s) => s.doc.settings)
  const pageIndex = useEditor((s) => s.pageIndex)

  const applyTemplate = (id: string) => {
    const template = PAGE_TEMPLATES.find((t) => t.id === id)
    if (!template) return
    const built = template.build(settings.width, settings.height)
    const store = useEditor.getState()
    store.pushHistory()
    store.setPageBackground(pageIndex, built.background)
    // Replace the page contents with the template's elements.
    store.removeElements(store.doc.pages[pageIndex].elements.map((e) => e.id))
    store.addElements(built.elements, { select: false })
    store.renamePage(pageIndex, built.name)
  }

  return (
    <section>
      <h3>Page templates</h3>
      <p className="hint">Applies to the current page.</p>
      <div className="template-grid">
        {PAGE_TEMPLATES.map((t) => (
          <button key={t.id} className="template-card" onClick={() => applyTemplate(t.id)}>
            <TemplatePreview id={t.id} />
            <span>{t.name}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function TemplatePreview({ id }: { id: string }) {
  return (
    <div className={`template-preview tp-${id}`}>
      <i />
      <i />
      <i />
    </div>
  )
}

function ElementsTab() {
  const addElements = useEditor((s) => s.addElements)
  const settings = useEditor((s) => s.doc.settings)

  const addShape = (shape: ShapeKind) => {
    const size = Math.round(settings.width * 0.28)
    addElements([
      createShape(shape, {
        x: Math.round(settings.width / 2 - size / 2),
        y: Math.round(settings.height / 2 - size / 2),
        w: size,
        h: size,
      }),
    ])
  }

  return (
    <section>
      <h3>Shapes</h3>
      <div className="shape-grid">
        {SHAPES.map((shape) => (
          <button key={shape} className="shape-btn" title={shape} onClick={() => addShape(shape)}>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
              <path d={shapePath(shape)} fill="currentColor" />
            </svg>
          </button>
        ))}
      </div>

      <h3>Lines</h3>
      <div className="row-buttons">
        <button
          onClick={() =>
            addElements([
              createLine({
                x: Math.round(settings.width * 0.2),
                y: Math.round(settings.height * 0.5),
                w: Math.round(settings.width * 0.6),
              }),
            ])
          }
        >
          Straight line
        </button>
        <button
          onClick={() =>
            addElements([
              createLine({
                x: Math.round(settings.width * 0.2),
                y: Math.round(settings.height * 0.5),
                w: Math.round(settings.width * 0.6),
                endCap: 'arrow',
              }),
            ])
          }
        >
          Arrow
        </button>
        <button
          onClick={() =>
            addElements([
              createLine({
                x: Math.round(settings.width * 0.2),
                y: Math.round(settings.height * 0.5),
                w: Math.round(settings.width * 0.6),
                dash: [12, 10],
              }),
            ])
          }
        >
          Dashed
        </button>
      </div>

      <h3>Colour palette</h3>
      <div className="swatches">
        {PALETTE.map((c) => (
          <button
            key={c}
            className="swatch"
            style={{ background: c }}
            title={c}
            onClick={() => {
              const store = useEditor.getState()
              if (store.selection.length === 0) return
              store.updateElements(store.selection, (el) =>
                el.type === 'text'
                  ? { color: c }
                  : el.type === 'shape'
                    ? { fill: { kind: 'solid', color: c } }
                    : el.type === 'line'
                      ? { stroke: c }
                      : {},
              )
            }}
          />
        ))}
      </div>
      <p className="hint">Click a swatch to recolour the current selection.</p>
    </section>
  )
}

function TextTab() {
  const addElements = useEditor((s) => s.addElements)
  const settings = useEditor((s) => s.doc.settings)

  return (
    <section>
      <h3>Text</h3>
      {TEXT_PRESETS.map((preset) => (
        <button
          key={preset.label}
          className="text-preset"
          style={{ fontSize: Math.min(28, preset.size / 3.2), fontWeight: preset.weight }}
          onClick={() => {
            const el = createText({
              text: preset.label.replace('Add a ', '').replace('Add ', ''),
              x: Math.round(settings.width * 0.12),
              y: Math.round(settings.height * 0.4),
              w: Math.round(settings.width * 0.76),
              h: Math.round(preset.size * 1.6),
              fontSize: preset.size,
              fontWeight: preset.weight,
            })
            addElements([el])
            useEditor.getState().setEditingText(el.id)
          }}
        >
          {preset.label}
        </button>
      ))}
      <p className="hint">Tip: press T then drag on the canvas to draw a text box.</p>
    </section>
  )
}

function UploadsTab() {
  const doc = useEditor((s) => s.doc)
  const registerAsset = useEditor((s) => s.registerAsset)
  const addElements = useEditor((s) => s.addElements)
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setBusy(true)
    setError(null)
    for (const file of Array.from(files)) {
      try {
        const asset = await api.uploadAsset(file)
        registerAsset(asset)
      } catch {
        // Without the API (static hosting or offline) keep the image inline so
        // the editor and the offline export still work.
        try {
          const dataUrl = await fileToDataUrl(file)
          registerAsset({
            id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: file.name,
            mime: file.type,
            size: file.size,
            url: dataUrl,
          })
          setError('Saved locally — the upload API was unreachable.')
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Upload failed')
        }
      }
    }
    setBusy(false)
  }

  const assets = Object.values(doc.assets)

  return (
    <section>
      <h3>Uploads</h3>
      <button className="primary block" onClick={() => inputRef.current?.click()} disabled={busy}>
        {busy ? 'Uploading…' : 'Upload images'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/mp4"
        multiple
        hidden
        onChange={(e) => {
          void upload(e.target.files)
          e.target.value = ''
        }}
      />
      {error && <p className="hint warn">{error}</p>}

      <div className="asset-grid">
        {assets.map((asset) => (
          <button
            key={asset.id}
            className="asset-card"
            title={asset.name}
            onClick={() => {
              const settings = doc.settings
              const w = Math.round(settings.width * 0.5)
              const ratio = asset.width && asset.height ? asset.height / asset.width : 0.75
              addElements([
                createImage(`asset:${asset.id}`, {
                  name: asset.name,
                  x: Math.round(settings.width * 0.25),
                  y: Math.round(settings.height * 0.3),
                  w,
                  h: Math.round(w * ratio),
                }),
              ])
            }}
          >
            <img src={asset.url} alt={asset.name} />
          </button>
        ))}
      </div>
      {assets.length === 0 && <p className="hint">No uploads yet.</p>}
    </section>
  )
}

function BackgroundTab() {
  const pageIndex = useEditor((s) => s.pageIndex)
  const page = useEditor((s) => s.doc.pages[s.pageIndex])
  const doc = useEditor((s) => s.doc)
  const setPageBackground = useEditor((s) => s.setPageBackground)
  const fill = page?.background.fill

  return (
    <section>
      <h3>Page background</h3>
      <div className="swatches">
        {PALETTE.map((c) => (
          <button
            key={c}
            className="swatch"
            style={{ background: c }}
            onClick={() => setPageBackground(pageIndex, { fill: { kind: 'solid', color: c } })}
          />
        ))}
      </div>

      <label className="field">
        <span>Custom colour</span>
        <input
          type="color"
          value={fill?.kind === 'solid' ? fill.color : '#ffffff'}
          onChange={(e) =>
            setPageBackground(pageIndex, { fill: { kind: 'solid', color: e.target.value } })
          }
        />
      </label>

      <h3>Gradient</h3>
      <div className="row-buttons">
        {[
          ['#8e7bff', '#37306b'],
          ['#00b894', '#0f3d33'],
          ['#fdcb6e', '#e17055'],
          ['#0984e3', '#0b2545'],
        ].map(([from, to]) => (
          <button
            key={from}
            className="gradient-btn"
            style={{ background: `linear-gradient(140deg, ${from}, ${to})` }}
            onClick={() =>
              setPageBackground(pageIndex, { fill: { kind: 'linear', from, to, angle: 140 } })
            }
          />
        ))}
      </div>

      <h3>Background image</h3>
      <div className="asset-grid">
        {Object.values(doc.assets).map((asset) => (
          <button
            key={asset.id}
            className="asset-card"
            onClick={() =>
              setPageBackground(pageIndex, {
                image: { src: `asset:${asset.id}`, fit: 'cover', opacity: 1 },
              })
            }
          >
            <img src={asset.url} alt={asset.name} />
          </button>
        ))}
      </div>
      {page?.background.image && (
        <button className="block" onClick={() => setPageBackground(pageIndex, { image: undefined })}>
          Remove background image
        </button>
      )}

      <h3>Apply to all pages</h3>
      <button
        className="block"
        onClick={() => {
          const store = useEditor.getState()
          const background = store.doc.pages[pageIndex].background
          store.pushHistory()
          store.doc.pages.forEach((_, i) => store.setPageBackground(i, background))
        }}
      >
        Use this background everywhere
      </button>
    </section>
  )
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
