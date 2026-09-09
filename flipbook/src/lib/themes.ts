/**
 * Flipbook themes.
 *
 * A theme is a coordinated set of page surface, ink, accent and fonts. Applying
 * one rewrites page backgrounds and viewer chrome, and remaps element colours
 * and fonts that still match the *previous* theme — so a deliberate colour
 * choice survives a theme change, while untouched defaults follow along.
 */
import type { DocSettings, Fill, PageBackground, PaperTexture } from '../shared/types'

export interface FlipTheme {
  id: string
  name: string
  description: string
  /** Surround behind the book in the reader and the offline export. */
  viewerBackground: string
  /** Surface applied to every page. */
  pageBackground: PageBackground
  /** Primary text colour — headings and body copy. */
  ink: string
  /** Secondary text colour — captions, subtitles, supporting copy. */
  inkMuted: string
  /** Shape fills, rules and highlights. */
  accent: string
  headingFont: string
  bodyFont: string
  /** Tinted page surface for pull-quotes and feature pages. */
  surfaceAlt: string
  /** Cover pages get their own, higher-contrast treatment. */
  cover: { background: PageBackground; ink: string; inkMuted: string }
  /** Paper stock tiled across every page. */
  paper: PaperTexture
  /** Swatches offered in the left panel while this theme is active. */
  palette: string[]
  flipStyle: DocSettings['flipStyle']
}

/**
 * The look a brand-new document already has. Treating it as a real theme means
 * the very first theme change can remap the colours templates produced.
 */
export const DEFAULT_THEME: FlipTheme = {
  id: 'studio',
  name: 'Studio',
  description: 'Clean white pages, violet accent',
  viewerBackground: '#1b1c22',
  pageBackground: { fill: { kind: 'solid', color: '#ffffff' } },
  ink: '#111318',
  inkMuted: '#3a3f4b',
  accent: '#6c5ce7',
  headingFont: 'Inter',
  bodyFont: 'Inter',
  paper: { kind: 'none', color: '#111318', opacity: 0.1, scale: 24 },
  surfaceAlt: '#f4f2ff',
  cover: {
    background: { fill: { kind: 'linear', from: '#221a4b', to: '#0f1020', angle: 160 } },
    ink: '#ffffff',
    inkMuted: 'rgba(255,255,255,.72)',
  },
  palette: ['#ffffff', '#f4f2ff', '#111318', '#3a3f4b', '#6c5ce7', '#8e7bff',
            '#00b894', '#0984e3', '#fdcb6e', '#e17055', '#d63031', '#e84393'],
  flipStyle: 'curl',
}

export const THEMES: FlipTheme[] = [
  DEFAULT_THEME,
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Dark pages, luminous accent',
    viewerBackground: '#07080d',
    pageBackground: { fill: { kind: 'linear', from: '#1c1b3a', to: '#0d0e18', angle: 155 } },
    ink: '#f2f1fb',
    inkMuted: '#a49fd0',
    accent: '#8e7bff',
    headingFont: 'Poppins',
    bodyFont: 'Inter',
    paper: { kind: 'grain', color: '#000000', opacity: 0.14, scale: 5 },
    surfaceAlt: '#171630',
    cover: {
      background: { fill: { kind: 'linear', from: '#3a2f8f', to: '#08070f', angle: 160 } },
      ink: '#ffffff',
      inkMuted: 'rgba(255,255,255,.7)',
    },
    palette: ['#0d0e18', '#1c1b3a', '#f2f1fb', '#a49fd0', '#8e7bff', '#6c5ce7',
              '#55efc4', '#74b9ff', '#ffeaa7', '#ff7675', '#fd79a8', '#ffffff'],
    flipStyle: 'curl',
  },
  {
    id: 'editorial',
    name: 'Editorial',
    description: 'Cream paper, serif headlines',
    viewerBackground: '#2b2724',
    pageBackground: { fill: { kind: 'solid', color: '#f7f3ea' } },
    ink: '#1d1a16',
    inkMuted: '#5c554b',
    accent: '#a32b2b',
    headingFont: 'Playfair Display',
    bodyFont: 'Georgia',
    paper: { kind: 'fiber', color: '#8a7f6d', opacity: 0.13, scale: 9 },
    surfaceAlt: '#ece3d2',
    cover: {
      background: { fill: { kind: 'solid', color: '#1d1a16' } },
      ink: '#f7f3ea',
      inkMuted: 'rgba(247,243,234,.7)',
    },
    palette: ['#f7f3ea', '#ece3d2', '#1d1a16', '#5c554b', '#a32b2b', '#c96a4a',
              '#4a6c52', '#2f4858', '#d9a441', '#8c7851', '#ffffff', '#000000'],
    flipStyle: 'curl',
  },
  {
    id: 'botanical',
    name: 'Botanical',
    description: 'Soft green, calm and airy',
    viewerBackground: '#12241d',
    pageBackground: { fill: { kind: 'solid', color: '#f2f7f2' } },
    ink: '#16311f',
    inkMuted: '#4a6b56',
    accent: '#2f9e6b',
    headingFont: 'Poppins',
    bodyFont: 'Inter',
    paper: { kind: 'dots', color: '#16311f', opacity: 0.08, scale: 20 },
    surfaceAlt: '#dcebdf',
    cover: {
      background: { fill: { kind: 'linear', from: '#2f9e6b', to: '#0f2a1e', angle: 160 } },
      ink: '#ffffff',
      inkMuted: 'rgba(255,255,255,.75)',
    },
    palette: ['#f2f7f2', '#dcebdf', '#16311f', '#4a6b56', '#2f9e6b', '#55c99a',
              '#c9d94f', '#e8b84b', '#d97e4a', '#2f4858', '#ffffff', '#0b1a12'],
    flipStyle: 'slide',
  },
  {
    id: 'sunset',
    name: 'Sunset',
    description: 'Warm gradient pages',
    viewerBackground: '#241017',
    pageBackground: { fill: { kind: 'linear', from: '#fff1e6', to: '#ffd9c7', angle: 160 } },
    ink: '#3d1f19',
    inkMuted: '#7a5147',
    accent: '#e2593b',
    headingFont: 'Poppins',
    bodyFont: 'Inter',
    paper: { kind: 'grain', color: '#000000', opacity: 0.1, scale: 5 },
    surfaceAlt: '#ffe3d3',
    cover: {
      background: { fill: { kind: 'linear', from: '#e2593b', to: '#5a1f2e', angle: 160 } },
      ink: '#fff6ef',
      inkMuted: 'rgba(255,246,239,.75)',
    },
    palette: ['#fff1e6', '#ffd9c7', '#3d1f19', '#7a5147', '#e2593b', '#f2955c',
              '#c9356a', '#7b3f8c', '#f6c667', '#2f4858', '#ffffff', '#1a0d0a'],
    flipStyle: 'curl',
  },
  {
    id: 'siam',
    name: 'Siam',
    description: 'Thai-first fonts, teal and gold',
    viewerBackground: '#0f1f22',
    pageBackground: { fill: { kind: 'solid', color: '#fbf9f4' } },
    ink: '#14282c',
    inkMuted: '#4c6b70',
    accent: '#0f7c85',
    headingFont: 'Prompt',
    bodyFont: 'Sarabun',
    paper: { kind: 'linen', color: '#14282c', opacity: 0.1, scale: 22 },
    surfaceAlt: '#e6efee',
    cover: {
      background: { fill: { kind: 'linear', from: '#0f7c85', to: '#0a1f24', angle: 160 } },
      ink: '#ffffff',
      inkMuted: 'rgba(255,255,255,.75)',
    },
    palette: ['#fbf9f4', '#e6efee', '#14282c', '#4c6b70', '#0f7c85', '#3fb0a5',
              '#c8a44a', '#8c5a2b', '#a3332f', '#2f4858', '#ffffff', '#08161a'],
    flipStyle: 'curl',
  },
]

export function findTheme(id: string | undefined): FlipTheme {
  return THEMES.find((t) => t.id === id) ?? DEFAULT_THEME
}

/**
 * Colour and font substitutions to run when moving from one theme to another.
 * Only exact matches are rewritten, so anything the author picked by hand stays.
 */
export function sameFill(a: Fill, b: Fill): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'solid' && b.kind === 'solid') {
    return a.color.toLowerCase() === b.color.toLowerCase()
  }
  if (a.kind === 'linear' && b.kind === 'linear') {
    return (
      a.from.toLowerCase() === b.from.toLowerCase() &&
      a.to.toLowerCase() === b.to.toLowerCase() &&
      a.angle === b.angle
    )
  }
  return a.kind === 'none' && b.kind === 'none'
}

/**
 * Move a page background from one theme to the equivalent surface in another:
 * body pages, cover pages and tinted feature pages each keep their role. A
 * background that matches none of the outgoing theme's surfaces was chosen by
 * the author, and is returned untouched.
 */
export function remapBackground(
  background: PageBackground,
  from: FlipTheme,
  to: FlipTheme,
): PageBackground {
  const keepImage = background.image ? { image: background.image } : {}
  if (sameFill(background.fill, from.pageBackground.fill)) {
    return { ...structuredClone(to.pageBackground), ...keepImage }
  }
  if (sameFill(background.fill, from.cover.background.fill)) {
    return { ...structuredClone(to.cover.background), ...keepImage }
  }
  if (sameFill(background.fill, { kind: 'solid', color: from.surfaceAlt })) {
    return { ...background, fill: { kind: 'solid', color: to.surfaceAlt } }
  }
  return background
}

export function themeRemap(from: FlipTheme, to: FlipTheme): {
  colors: Map<string, string>
  fonts: Map<string, string>
} {
  const colors = new Map<string, string>()
  const fonts = new Map<string, string>()
  const addColor = (a: string, b: string) => {
    if (a.toLowerCase() !== b.toLowerCase()) colors.set(a.toLowerCase(), b)
  }
  addColor(from.ink, to.ink)
  addColor(from.inkMuted, to.inkMuted)
  addColor(from.accent, to.accent)
  addColor(from.surfaceAlt, to.surfaceAlt)
  addColor(from.cover.ink, to.cover.ink)
  addColor(from.cover.inkMuted, to.cover.inkMuted)
  if (from.headingFont !== to.headingFont) fonts.set(from.headingFont, to.headingFont)
  if (from.bodyFont !== to.bodyFont) fonts.set(from.bodyFont, to.bodyFont)
  return { colors, fonts }
}
