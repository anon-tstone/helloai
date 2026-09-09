import { nanoid } from 'nanoid'
import {
  DEFAULT_SETTINGS,
  DOC_VERSION,
  type FlipDoc,
  type FlipElement,
  type FlipPage,
  type ImageElement,
  type LineElement,
  type ShapeElement,
  type ShapeKind,
  type TextElement,
  type VideoElement,
  type AssetRef,
} from '../shared/types'

export const newId = () => nanoid(10)

function base(type: FlipElement['type'], name: string, x: number, y: number, w: number, h: number) {
  return {
    id: newId(),
    type,
    name,
    x,
    y,
    w,
    h,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    groupId: null,
  }
}

export function createText(partial: Partial<TextElement> = {}): TextElement {
  return {
    ...base('text', 'Text', 120, 120, 520, 120),
    type: 'text',
    text: 'Double-click to edit',
    fontFamily: 'Inter',
    fontSize: 64,
    fontWeight: 700,
    italic: false,
    underline: false,
    align: 'left',
    color: '#111318',
    lineHeight: 1.25,
    letterSpacing: 0,
    uppercase: false,
    verticalAlign: 'middle',
    ...partial,
  } as TextElement
}

export function createShape(shape: ShapeKind, partial: Partial<ShapeElement> = {}): ShapeElement {
  return {
    ...base('shape', shapeLabel(shape), 160, 160, 320, 320),
    type: 'shape',
    shape,
    fill: { kind: 'solid', color: '#6c5ce7' },
    stroke: '#2d2a55',
    strokeWidth: 0,
    radius: shape === 'rect' ? 16 : 0,
    ...partial,
  } as ShapeElement
}

export function createLine(partial: Partial<LineElement> = {}): LineElement {
  return {
    ...base('line', 'Line', 160, 400, 420, 24),
    type: 'line',
    stroke: '#111318',
    strokeWidth: 4,
    dash: [],
    startCap: 'none',
    endCap: 'none',
    ...partial,
  } as LineElement
}

export function createImage(src: string, partial: Partial<ImageElement> = {}): ImageElement {
  return {
    ...base('image', 'Image', 160, 160, 480, 360),
    type: 'image',
    src,
    fit: 'cover',
    radius: 0,
    flipX: false,
    flipY: false,
    filter: { brightness: 100, contrast: 100, saturate: 100, blur: 0, grayscale: 0 },
    ...partial,
  } as ImageElement
}

export function createVideo(src: string, partial: Partial<VideoElement> = {}): VideoElement {
  return {
    ...base('video', 'Video', 160, 160, 640, 360),
    type: 'video',
    src,
    // Autoplay only works in browsers when the video is muted, so default to
    // a muted, looping clip with controls available.
    autoplay: false,
    loop: true,
    muted: true,
    controls: true,
    ...partial,
  } as VideoElement
}

export function createPage(partial: Partial<FlipPage> = {}): FlipPage {
  return {
    id: newId(),
    name: 'Page',
    background: { fill: { kind: 'solid', color: '#ffffff' } },
    elements: [],
    ...partial,
  }
}

export function createDoc(title = 'Untitled flipbook'): FlipDoc {
  return {
    version: DOC_VERSION,
    id: newId(),
    title,
    settings: { ...DEFAULT_SETTINGS },
    pages: [createPage({ name: 'Cover' }), createPage({ name: 'Page 2' })],
    assets: {},
    updatedAt: Date.now(),
  }
}

export function shapeLabel(shape: ShapeKind): string {
  return shape.charAt(0).toUpperCase() + shape.slice(1)
}

/** Deep clone with fresh ids, used by duplicate / copy-paste / page cloning. */
export function cloneElements(elements: FlipElement[]): FlipElement[] {
  const groupMap = new Map<string, string>()
  return elements.map((el) => {
    const copy = structuredClone(el)
    copy.id = newId()
    if (copy.groupId) {
      if (!groupMap.has(copy.groupId)) groupMap.set(copy.groupId, newId())
      copy.groupId = groupMap.get(copy.groupId)!
    }
    return copy
  })
}

export function clonePage(page: FlipPage, name?: string): FlipPage {
  return {
    id: newId(),
    name: name ?? `${page.name} copy`,
    background: structuredClone(page.background),
    elements: cloneElements(page.elements),
  }
}

/**
 * Builds the right element for an uploaded asset — a video asset becomes a
 * video element, everything else an image — sized to the asset's true aspect
 * ratio and centred on the given point.
 *
 * Shared by the Uploads panel and by dropping onto the canvas, so both routes
 * place media identically.
 */
export function elementForAsset(
  asset: AssetRef,
  at: { x: number; y: number },
  maxWidth: number,
): FlipElement {
  const isVideo = asset.mime.startsWith('video/')
  const ratio =
    asset.width && asset.height ? asset.height / asset.width : isVideo ? 9 / 16 : 0.75
  const w = Math.round(Math.min(maxWidth, asset.width ?? maxWidth))
  const h = Math.round(w * ratio)
  const box = {
    name: asset.name,
    x: Math.round(at.x - w / 2),
    y: Math.round(at.y - h / 2),
    w,
    h,
  }
  return isVideo
    ? createVideo(`asset:${asset.id}`, box)
    : createImage(`asset:${asset.id}`, box)
}
