import { useState } from 'react'
import { useEditor, useSelectedElements } from '../store/editor'
import type {
  AnimationKind,
  FlipElement,
  ImageElement,
  LineElement,
  ShapeElement,
  TextElement,
  VideoElement,
} from '../shared/types'
import { fillToCss } from '../lib/style'

const FONTS = [
  'Inter',
  'Poppins',
  'Playfair Display',
  'Georgia',
  'Times New Roman',
  'Courier New',
  'Sarabun',
  'Prompt',
  'Kanit',
]

const ANIMATIONS: AnimationKind[] = ['none', 'fade', 'slide-up', 'slide-left', 'zoom', 'pop']

export function RightPanel() {
  const [tab, setTab] = useState<'design' | 'layers' | 'document'>('design')
  const selected = useSelectedElements()

  return (
    <aside className="right-panel">
      <nav className="right-tabs">
        {(['design', 'layers', 'document'] as const).map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>
      <div className="right-body">
        {tab === 'design' &&
          (selected.length === 0 ? (
            <p className="hint pad">Select an element to edit its properties.</p>
          ) : (
            <Inspector selected={selected} />
          ))}
        {tab === 'layers' && <LayersPanel />}
        {tab === 'document' && <DocumentPanel />}
      </div>
    </aside>
  )
}

function Inspector({ selected }: { selected: FlipElement[] }) {
  const update = useEditor((s) => s.updateElements)
  const ids = selected.map((e) => e.id)
  const first = selected[0]
  const sameType = selected.every((e) => e.type === first.type)

  const patch = (fn: (el: FlipElement) => Partial<FlipElement>) => update(ids, fn)

  return (
    <div className="inspector">
      <Group title="Position & size">
        <div className="grid-2">
          <NumberField
            label="X"
            value={Math.round(first.x)}
            onChange={(v) => patch(() => ({ x: v }))}
          />
          <NumberField
            label="Y"
            value={Math.round(first.y)}
            onChange={(v) => patch(() => ({ y: v }))}
          />
          <NumberField
            label="W"
            value={Math.round(first.w)}
            min={1}
            onChange={(v) => patch(() => ({ w: v }))}
          />
          <NumberField
            label="H"
            value={Math.round(first.h)}
            min={1}
            onChange={(v) => patch(() => ({ h: v }))}
          />
          <NumberField
            label="Rotate"
            value={Math.round(first.rotation)}
            onChange={(v) => patch(() => ({ rotation: v }))}
          />
          <NumberField
            label="Opacity %"
            value={Math.round(first.opacity * 100)}
            min={0}
            max={100}
            onChange={(v) => patch(() => ({ opacity: v / 100 }))}
          />
        </div>
      </Group>

      {sameType && first.type === 'text' && <TextInspector el={first as TextElement} ids={ids} />}
      {sameType && first.type === 'shape' && <ShapeInspector el={first as ShapeElement} ids={ids} />}
      {sameType && first.type === 'line' && <LineInspector el={first as LineElement} ids={ids} />}
      {sameType && first.type === 'image' && <ImageInspector el={first as ImageElement} ids={ids} />}
      {sameType && first.type === 'video' && <VideoInspector el={first as VideoElement} ids={ids} />}

      <Group title="Effects">
        <label className="field">
          <span>Shadow</span>
          <input
            type="checkbox"
            checked={Boolean(first.shadow)}
            onChange={(e) =>
              patch(() => ({
                shadow: e.target.checked
                  ? { x: 0, y: 12, blur: 28, color: 'rgba(0,0,0,.28)' }
                  : undefined,
              }))
            }
          />
        </label>
        {first.shadow && (
          <div className="grid-2">
            <NumberField
              label="Offset X"
              value={first.shadow.x}
              onChange={(v) => patch((el) => ({ shadow: { ...el.shadow!, x: v } }))}
            />
            <NumberField
              label="Offset Y"
              value={first.shadow.y}
              onChange={(v) => patch((el) => ({ shadow: { ...el.shadow!, y: v } }))}
            />
            <NumberField
              label="Blur"
              value={first.shadow.blur}
              min={0}
              onChange={(v) => patch((el) => ({ shadow: { ...el.shadow!, blur: v } }))}
            />
            <label className="field">
              <span>Colour</span>
              <input
                type="color"
                value="#000000"
                onChange={(e) => patch((el) => ({ shadow: { ...el.shadow!, color: e.target.value } }))}
              />
            </label>
          </div>
        )}
      </Group>

      <Group title="Animation">
        <label className="field">
          <span>Entrance</span>
          <select
            value={first.animation?.kind ?? 'none'}
            onChange={(e) =>
              patch(() => ({
                animation: {
                  kind: e.target.value as AnimationKind,
                  delay: first.animation?.delay ?? 0,
                  duration: first.animation?.duration ?? 600,
                },
              }))
            }
          >
            {ANIMATIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        {first.animation && first.animation.kind !== 'none' && (
          <div className="grid-2">
            <NumberField
              label="Delay ms"
              value={first.animation.delay}
              min={0}
              step={50}
              onChange={(v) => patch((el) => ({ animation: { ...el.animation!, delay: v } }))}
            />
            <NumberField
              label="Duration ms"
              value={first.animation.duration}
              min={50}
              step={50}
              onChange={(v) => patch((el) => ({ animation: { ...el.animation!, duration: v } }))}
            />
          </div>
        )}
      </Group>

      <Group title="Link">
        <label className="field">
          <span>URL</span>
          <input
            type="url"
            placeholder="https://…"
            value={first.link?.kind === 'url' ? first.link.url : ''}
            onChange={(e) =>
              patch(() => ({
                link: e.target.value ? { kind: 'url', url: e.target.value } : undefined,
              }))
            }
          />
        </label>
      </Group>
    </div>
  )
}

function TextInspector({ el, ids }: { el: TextElement; ids: string[] }) {
  const update = useEditor((s) => s.updateElements)
  const patch = (p: Partial<TextElement>) => update(ids, () => p as Partial<FlipElement>)

  return (
    <Group title="Text">
      <label className="field">
        <span>Font</span>
        <select value={el.fontFamily} onChange={(e) => patch({ fontFamily: e.target.value })}>
          {FONTS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </label>
      <div className="grid-2">
        <NumberField
          label="Size"
          value={el.fontSize}
          min={4}
          onChange={(v) => patch({ fontSize: v })}
        />
        <label className="field">
          <span>Weight</span>
          <select
            value={el.fontWeight}
            onChange={(e) => patch({ fontWeight: Number(e.target.value) })}
          >
            {[300, 400, 500, 600, 700, 800, 900].map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>
        <NumberField
          label="Line height"
          value={el.lineHeight}
          step={0.05}
          onChange={(v) => patch({ lineHeight: v })}
        />
        <NumberField
          label="Letter spacing"
          value={el.letterSpacing}
          step={0.5}
          onChange={(v) => patch({ letterSpacing: v })}
        />
      </div>

      <div className="segmented">
        {(['left', 'center', 'right', 'justify'] as const).map((a) => (
          <button key={a} className={el.align === a ? 'active' : ''} onClick={() => patch({ align: a })}>
            {a[0].toUpperCase()}
          </button>
        ))}
      </div>

      <div className="segmented">
        <button className={el.fontWeight >= 700 ? 'active' : ''} onClick={() => patch({ fontWeight: el.fontWeight >= 700 ? 400 : 700 })}>
          <b>B</b>
        </button>
        <button className={el.italic ? 'active' : ''} onClick={() => patch({ italic: !el.italic })}>
          <i>I</i>
        </button>
        <button className={el.underline ? 'active' : ''} onClick={() => patch({ underline: !el.underline })}>
          <u>U</u>
        </button>
        <button className={el.uppercase ? 'active' : ''} onClick={() => patch({ uppercase: !el.uppercase })}>
          AA
        </button>
      </div>

      <label className="field">
        <span>Colour</span>
        <input type="color" value={toHex(el.color)} onChange={(e) => patch({ color: e.target.value })} />
      </label>

      <label className="field">
        <span>Vertical align</span>
        <select
          value={el.verticalAlign}
          onChange={(e) => patch({ verticalAlign: e.target.value as TextElement['verticalAlign'] })}
        >
          <option value="top">Top</option>
          <option value="middle">Middle</option>
          <option value="bottom">Bottom</option>
        </select>
      </label>
    </Group>
  )
}

function ShapeInspector({ el, ids }: { el: ShapeElement; ids: string[] }) {
  const update = useEditor((s) => s.updateElements)
  const patch = (p: Partial<ShapeElement>) => update(ids, () => p as Partial<FlipElement>)

  return (
    <Group title="Shape">
      {/* The solid picker is meaningless while a gradient is active. */}
      {el.fill.kind !== 'linear' && (
        <label className="field">
          <span>Fill</span>
          <input
            type="color"
            value={el.fill.kind === 'solid' ? toHex(el.fill.color) : '#6c5ce7'}
            onChange={(e) => patch({ fill: { kind: 'solid', color: e.target.value } })}
          />
        </label>
      )}
      <label className="field">
        <span>Gradient</span>
        <input
          type="checkbox"
          checked={el.fill.kind === 'linear'}
          onChange={(e) =>
            patch({
              fill: e.target.checked
                ? {
                    kind: 'linear',
                    // Start the gradient from the colour already in use.
                    from: el.fill.kind === 'solid' ? el.fill.color : '#8e7bff',
                    to: '#37306b',
                    angle: 140,
                  }
                : { kind: 'solid', color: el.fill.kind === 'linear' ? el.fill.from : '#6c5ce7' },
            })
          }
        />
      </label>
      {el.fill.kind === 'linear' && (
        <GradientFields fill={el.fill} onChange={(fill) => patch({ fill })} />
      )}
      <div className="grid-2">
        <NumberField
          label="Stroke width"
          value={el.strokeWidth}
          min={0}
          onChange={(v) => patch({ strokeWidth: v })}
        />
        <label className="field">
          <span>Stroke</span>
          <input type="color" value={toHex(el.stroke)} onChange={(e) => patch({ stroke: e.target.value })} />
        </label>
      </div>
      {el.shape === 'rect' && (
        <NumberField label="Corner radius" value={el.radius} min={0} onChange={(v) => patch({ radius: v })} />
      )}
      <div className="preview-chip" style={{ background: fillToCss(el.fill) }} />
    </Group>
  )
}

function GradientFields({
  fill,
  onChange,
}: {
  fill: Extract<ShapeElement['fill'], { kind: 'linear' }>
  onChange: (fill: ShapeElement['fill']) => void
}) {
  return (
    <div className="grid-2">
      <label className="field">
        <span>From</span>
        <input
          type="color"
          value={toHex(fill.from)}
          onChange={(e) => onChange({ ...fill, from: e.target.value })}
        />
      </label>
      <label className="field">
        <span>To</span>
        <input
          type="color"
          value={toHex(fill.to)}
          onChange={(e) => onChange({ ...fill, to: e.target.value })}
        />
      </label>
      <NumberField
        label="Angle"
        value={fill.angle}
        onChange={(v) => onChange({ ...fill, angle: v })}
      />
    </div>
  )
}

function LineInspector({ el, ids }: { el: LineElement; ids: string[] }) {
  const update = useEditor((s) => s.updateElements)
  const patch = (p: Partial<LineElement>) => update(ids, () => p as Partial<FlipElement>)
  return (
    <Group title="Line">
      <div className="grid-2">
        <NumberField label="Thickness" value={el.strokeWidth} min={1} onChange={(v) => patch({ strokeWidth: v })} />
        <label className="field">
          <span>Colour</span>
          <input type="color" value={toHex(el.stroke)} onChange={(e) => patch({ stroke: e.target.value })} />
        </label>
      </div>
      <label className="field">
        <span>Dashed</span>
        <input
          type="checkbox"
          checked={el.dash.length > 0}
          onChange={(e) => patch({ dash: e.target.checked ? [12, 10] : [] })}
        />
      </label>
      <div className="grid-2">
        <label className="field">
          <span>Start cap</span>
          <select value={el.startCap} onChange={(e) => patch({ startCap: e.target.value as LineElement['startCap'] })}>
            <option value="none">None</option>
            <option value="arrow">Arrow</option>
            <option value="dot">Dot</option>
          </select>
        </label>
        <label className="field">
          <span>End cap</span>
          <select value={el.endCap} onChange={(e) => patch({ endCap: e.target.value as LineElement['endCap'] })}>
            <option value="none">None</option>
            <option value="arrow">Arrow</option>
            <option value="dot">Dot</option>
          </select>
        </label>
      </div>
    </Group>
  )
}

function ImageInspector({ el, ids }: { el: ImageElement; ids: string[] }) {
  const update = useEditor((s) => s.updateElements)
  const patch = (p: Partial<ImageElement>) => update(ids, () => p as Partial<FlipElement>)
  const filter = (p: Partial<ImageElement['filter']>) =>
    update(ids, (cur) => ({ filter: { ...(cur as ImageElement).filter, ...p } }) as Partial<FlipElement>)

  return (
    <Group title="Image">
      <label className="field">
        <span>Fit</span>
        <select value={el.fit} onChange={(e) => patch({ fit: e.target.value as ImageElement['fit'] })}>
          <option value="cover">Cover</option>
          <option value="contain">Contain</option>
          <option value="fill">Stretch</option>
        </select>
      </label>
      <NumberField label="Corner radius" value={el.radius} min={0} onChange={(v) => patch({ radius: v })} />
      <div className="segmented">
        <button className={el.flipX ? 'active' : ''} onClick={() => patch({ flipX: !el.flipX })}>
          Flip H
        </button>
        <button className={el.flipY ? 'active' : ''} onClick={() => patch({ flipY: !el.flipY })}>
          Flip V
        </button>
      </div>
      <div className="grid-2">
        <NumberField label="Brightness" value={el.filter.brightness} onChange={(v) => filter({ brightness: v })} />
        <NumberField label="Contrast" value={el.filter.contrast} onChange={(v) => filter({ contrast: v })} />
        <NumberField label="Saturation" value={el.filter.saturate} onChange={(v) => filter({ saturate: v })} />
        <NumberField label="Blur" value={el.filter.blur} min={0} onChange={(v) => filter({ blur: v })} />
        <NumberField
          label="Grayscale"
          value={el.filter.grayscale}
          min={0}
          max={100}
          onChange={(v) => filter({ grayscale: v })}
        />
      </div>
    </Group>
  )
}

function VideoInspector({ el, ids }: { el: VideoElement; ids: string[] }) {
  const update = useEditor((s) => s.updateElements)
  const assets = useEditor((s) => s.doc.assets)
  const patch = (p: Partial<VideoElement>) => update(ids, () => p as Partial<FlipElement>)
  const posters = Object.values(assets).filter((a) => a.mime.startsWith('image/'))

  return (
    <Group title="Video">
      <label className="field inline">
        <input
          type="checkbox"
          checked={el.controls}
          onChange={(e) => patch({ controls: e.target.checked })}
        />
        <span>Show player controls</span>
      </label>
      <label className="field inline">
        <input
          type="checkbox"
          checked={el.autoplay}
          // Browsers only honour autoplay on muted video, so keep the two in step.
          onChange={(e) => patch({ autoplay: e.target.checked, muted: e.target.checked || el.muted })}
        />
        <span>Play automatically</span>
      </label>
      <label className="field inline">
        <input type="checkbox" checked={el.loop} onChange={(e) => patch({ loop: e.target.checked })} />
        <span>Loop</span>
      </label>
      <label className="field inline">
        <input
          type="checkbox"
          checked={el.muted}
          disabled={el.autoplay}
          onChange={(e) => patch({ muted: e.target.checked })}
        />
        <span>Muted{el.autoplay ? ' (required for autoplay)' : ''}</span>
      </label>

      <label className="field">
        <span>Poster image</span>
        <select
          value={el.poster ?? ''}
          onChange={(e) => patch({ poster: e.target.value || undefined })}
        >
          <option value="">None</option>
          {posters.map((a) => (
            <option key={a.id} value={`asset:${a.id}`}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <p className="hint">
        Video is bundled into offline exports; autoplay still depends on the
        viewer's browser policy.
      </p>
    </Group>
  )
}

function LayersPanel() {
  const page = useEditor((s) => s.doc.pages[s.pageIndex])
  const selection = useEditor((s) => s.selection)
  const select = useEditor((s) => s.select)
  const update = useEditor((s) => s.updateElements)
  const reorder = useEditor((s) => s.reorder)
  const remove = useEditor((s) => s.removeElements)
  const [dragId, setDragId] = useState<string | null>(null)

  if (!page) return null
  // Layers read top-down, which is the reverse of paint order.
  const layers = [...page.elements].reverse()

  return (
    <div className="layers">
      {layers.map((el, i) => {
        const paintIndex = page.elements.length - 1 - i
        return (
          <div
            key={el.id}
            className={`layer ${selection.includes(el.id) ? 'selected' : ''}`}
            draggable
            onDragStart={() => setDragId(el.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragId && dragId !== el.id) reorder(dragId, paintIndex)
              setDragId(null)
            }}
            onClick={(e) => select([el.id], e.shiftKey)}
          >
            <span className="layer-type" data-type={el.type} />
            <span className="layer-name">{el.name || el.type}</span>
            <button
              title={el.hidden ? 'Show' : 'Hide'}
              onClick={(e) => {
                e.stopPropagation()
                update([el.id], () => ({ hidden: !el.hidden }))
              }}
            >
              {el.hidden ? '◌' : '◉'}
            </button>
            <button
              title={el.locked ? 'Unlock' : 'Lock'}
              onClick={(e) => {
                e.stopPropagation()
                update([el.id], () => ({ locked: !el.locked }))
              }}
            >
              {el.locked ? '🔒' : '🔓'}
            </button>
            <button
              title="Delete"
              onClick={(e) => {
                e.stopPropagation()
                remove([el.id])
              }}
            >
              ✕
            </button>
          </div>
        )
      })}
      {layers.length === 0 && <p className="hint pad">This page is empty.</p>}
    </div>
  )
}

function DocumentPanel() {
  const settings = useEditor((s) => s.doc.settings)
  const updateSettings = useEditor((s) => s.updateSettings)
  const title = useEditor((s) => s.doc.title)
  const setTitle = useEditor((s) => s.setTitle)

  return (
    <div className="inspector">
      <Group title="Document">
        <label className="field">
          <span>Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className="grid-2">
          <NumberField
            label="Page width"
            value={settings.width}
            min={100}
            onChange={(v) => updateSettings({ width: v })}
          />
          <NumberField
            label="Page height"
            value={settings.height}
            min={100}
            onChange={(v) => updateSettings({ height: v })}
          />
        </div>
        <div className="row-buttons">
          {[
            { label: 'A4 portrait', w: 1240, h: 1754 },
            { label: 'A4 landscape', w: 1754, h: 1240 },
            { label: 'Square', w: 1400, h: 1400 },
            { label: 'Slide 16:9', w: 1920, h: 1080 },
          ].map((p) => (
            <button key={p.label} onClick={() => updateSettings({ width: p.w, height: p.h })}>
              {p.label}
            </button>
          ))}
        </div>
      </Group>

      <Group title="Reading experience">
        <label className="field">
          <span>Spread</span>
          <select
            value={settings.spread}
            onChange={(e) => updateSettings({ spread: e.target.value as 'single' | 'double' })}
          >
            <option value="double">Two pages (book)</option>
            <option value="single">One page</option>
          </select>
        </label>
        <label className="field">
          <span>Turn style</span>
          <select
            value={settings.flipStyle}
            onChange={(e) => updateSettings({ flipStyle: e.target.value as 'curl' | 'slide' | 'fade' })}
          >
            <option value="curl">Page turn</option>
            <option value="slide">Slide</option>
            <option value="fade">Fade</option>
          </select>
        </label>
        <NumberField
          label="Turn duration ms"
          value={settings.flipDurationMs}
          min={100}
          step={50}
          onChange={(v) => updateSettings({ flipDurationMs: v })}
        />
        <label className="field">
          <span>Viewer background</span>
          <input
            type="color"
            value={toHex(settings.backgroundColor)}
            onChange={(e) => updateSettings({ backgroundColor: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Show page numbers</span>
          <input
            type="checkbox"
            checked={settings.showPageNumbers}
            onChange={(e) => updateSettings({ showPageNumbers: e.target.checked })}
          />
        </label>
      </Group>
    </div>
  )
}

// ---------------------------------------------------------------------------

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="inspector-group">
      <h4>{title}</h4>
      {children}
    </section>
  )
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v)) onChange(v)
        }}
      />
    </label>
  )
}

/** `<input type="color">` only accepts #rrggbb, so normalise other notations. */
function toHex(color: string): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
  }
  const m = color.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i)
  if (m) {
    const hex = (n: string) => Number(n).toString(16).padStart(2, '0')
    return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`
  }
  return '#000000'
}
