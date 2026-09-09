/**
 * Flipbook document model.
 *
 * This module is the single source of truth for the shape of a flipbook and is
 * imported by the editor, the Cloudflare Worker and the offline export runtime.
 * Keep it dependency-free so every consumer can use it.
 */

export const DOC_VERSION = 1

export type ElementType = 'text' | 'image' | 'shape' | 'line' | 'video' | 'embed'

export type ShapeKind =
  | 'rect'
  | 'ellipse'
  | 'triangle'
  | 'diamond'
  | 'pentagon'
  | 'hexagon'
  | 'star'
  | 'heart'
  | 'arrow'
  | 'speech'

export type TextAlign = 'left' | 'center' | 'right' | 'justify'
export type ImageFit = 'cover' | 'contain' | 'fill'

/** Everything an element has, regardless of type. Units are document pixels. */
export interface BaseElement {
  id: string
  type: ElementType
  name: string
  x: number
  y: number
  w: number
  h: number
  /** Rotation in degrees, clockwise, around the element centre. */
  rotation: number
  opacity: number
  locked: boolean
  hidden: boolean
  /** Elements sharing a non-null groupId move, resize and rotate together. */
  groupId: string | null
  shadow?: Shadow
  /** Interactive link, honoured by the reader and the offline export. */
  link?: ElementLink
  /** Entrance animation played when the page becomes visible in the reader. */
  animation?: ElementAnimation
}

export interface Shadow {
  x: number
  y: number
  blur: number
  color: string
}

export type ElementLink =
  | { kind: 'url'; url: string }
  | { kind: 'page'; pageIndex: number }

export type AnimationKind = 'none' | 'fade' | 'slide-up' | 'slide-left' | 'zoom' | 'pop'

export interface ElementAnimation {
  kind: AnimationKind
  /** Milliseconds. */
  delay: number
  duration: number
}

export interface TextElement extends BaseElement {
  type: 'text'
  text: string
  fontFamily: string
  fontSize: number
  fontWeight: number
  italic: boolean
  underline: boolean
  align: TextAlign
  color: string
  lineHeight: number
  letterSpacing: number
  uppercase: boolean
  /** Vertical placement of the text block inside the element box. */
  verticalAlign: 'top' | 'middle' | 'bottom'
}

export interface ImageElement extends BaseElement {
  type: 'image'
  /** Asset key (`asset:<id>`) or an absolute/data URL. */
  src: string
  fit: ImageFit
  radius: number
  flipX: boolean
  flipY: boolean
  filter: ImageFilter
}

export interface ImageFilter {
  brightness: number
  contrast: number
  saturate: number
  blur: number
  grayscale: number
}

export interface ShapeElement extends BaseElement {
  type: 'shape'
  shape: ShapeKind
  fill: Fill
  stroke: string
  strokeWidth: number
  /** Corner radius, only meaningful for `rect`. */
  radius: number
}

export interface LineElement extends BaseElement {
  type: 'line'
  stroke: string
  strokeWidth: number
  dash: number[]
  startCap: 'none' | 'arrow' | 'dot'
  endCap: 'none' | 'arrow' | 'dot'
}

export interface VideoElement extends BaseElement {
  type: 'video'
  src: string
  poster?: string
  autoplay: boolean
  loop: boolean
  muted: boolean
  controls: boolean
}

export interface EmbedElement extends BaseElement {
  type: 'embed'
  html: string
}

export type FlipElement =
  | TextElement
  | ImageElement
  | ShapeElement
  | LineElement
  | VideoElement
  | EmbedElement

export type Fill =
  | { kind: 'solid'; color: string }
  | { kind: 'linear'; from: string; to: string; angle: number }
  | { kind: 'none' }

export interface PageBackground {
  fill: Fill
  /** Optional background image drawn beneath every element. */
  image?: { src: string; fit: ImageFit; opacity: number }
}

export interface FlipPage {
  id: string
  name: string
  background: PageBackground
  /** Painted back-to-front: index 0 is the bottom layer. */
  elements: FlipElement[]
}

export type SpreadMode = 'single' | 'double'

export interface DocSettings {
  /** Page size in document pixels. Every page in a document shares it. */
  width: number
  height: number
  spread: SpreadMode
  /** Page-turn animation used by the reader and the offline export. */
  flipStyle: 'curl' | 'slide' | 'fade'
  flipDurationMs: number
  backgroundColor: string
  showPageNumbers: boolean
  /** Fonts referenced by the document, embedded into the offline export. */
  fonts: string[]
  /** Theme last applied, so the next theme change knows what to remap from. */
  themeId?: string
}

export interface FlipDoc {
  version: number
  id: string
  title: string
  settings: DocSettings
  pages: FlipPage[]
  /** Asset id -> metadata, resolved to real URLs at render time. */
  assets: Record<string, AssetRef>
  updatedAt: number
}

export interface AssetRef {
  id: string
  name: string
  mime: string
  size: number
  width?: number
  height?: number
  /** Public URL served by the Worker (`/api/assets/<id>`). */
  url: string
}

export const DEFAULT_SETTINGS: DocSettings = {
  width: 1240,
  height: 1754, // A4 at 150dpi
  spread: 'double',
  flipStyle: 'curl',
  flipDurationMs: 700,
  backgroundColor: '#1b1c22',
  showPageNumbers: true,
  fonts: ['Inter', 'Georgia', 'Sarabun'],
  themeId: 'studio',
}

export function isTextElement(el: FlipElement): el is TextElement {
  return el.type === 'text'
}
export function isImageElement(el: FlipElement): el is ImageElement {
  return el.type === 'image'
}
export function isShapeElement(el: FlipElement): el is ShapeElement {
  return el.type === 'shape'
}
export function isLineElement(el: FlipElement): el is LineElement {
  return el.type === 'line'
}
