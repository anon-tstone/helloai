/**
 * Page templates.
 *
 * Every template is built from the document's active theme, so applying a
 * template gives pages that already match the book — and a later theme change
 * remaps the colours they produced, because they came from the theme to begin
 * with.
 */
import type { FlipPage } from '../shared/types'
import { createPage, createShape, createText } from './factory'
import type { FlipTheme } from './themes'

export interface PageTemplate {
  id: string
  name: string
  build: (w: number, h: number, theme: FlipTheme) => FlipPage
}

export const PAGE_TEMPLATES: PageTemplate[] = [
  {
    id: 'blank',
    name: 'Blank',
    build: (_w, _h, theme) =>
      createPage({ name: 'Blank', background: structuredClone(theme.pageBackground) }),
  },
  {
    id: 'cover',
    name: 'Cover',
    build: (w, h, theme) =>
      createPage({
        name: 'Cover',
        background: structuredClone(theme.cover.background),
        elements: [
          createShape('rect', {
            name: 'Accent bar',
            x: w * 0.12,
            y: h * 0.42,
            w: w * 0.18,
            h: 10,
            radius: 6,
            fill: { kind: 'solid', color: theme.accent },
          }),
          createText({
            name: 'Title',
            text: 'Your Title Here',
            x: w * 0.12,
            y: h * 0.46,
            w: w * 0.76,
            h: h * 0.2,
            fontSize: Math.round(w * 0.1),
            fontWeight: 900,
            fontFamily: theme.headingFont,
            color: theme.cover.ink,
            lineHeight: 1.05,
          }),
          createText({
            name: 'Subtitle',
            text: 'A subtitle or short description',
            x: w * 0.12,
            y: h * 0.68,
            w: w * 0.7,
            h: h * 0.08,
            fontSize: Math.round(w * 0.032),
            fontWeight: 400,
            fontFamily: theme.bodyFont,
            color: theme.cover.inkMuted,
          }),
        ],
      }),
  },
  {
    id: 'title-body',
    name: 'Title + body',
    build: (w, h, theme) =>
      createPage({
        name: 'Article',
        background: structuredClone(theme.pageBackground),
        elements: [
          createText({
            name: 'Heading',
            text: 'Section heading',
            x: w * 0.1,
            y: h * 0.1,
            w: w * 0.8,
            h: h * 0.1,
            fontSize: Math.round(w * 0.062),
            fontWeight: 800,
            fontFamily: theme.headingFont,
            color: theme.ink,
          }),
          createShape('rect', {
            name: 'Rule',
            x: w * 0.1,
            y: h * 0.21,
            w: w * 0.12,
            h: 6,
            radius: 3,
            fill: { kind: 'solid', color: theme.accent },
          }),
          createText({
            name: 'Body',
            text:
              'Write your body copy here. Double-click any text to edit it, drag the handles to resize, and use the right-hand panel for typography and colour.',
            x: w * 0.1,
            y: h * 0.26,
            w: w * 0.8,
            h: h * 0.5,
            fontSize: Math.round(w * 0.028),
            fontWeight: 400,
            fontFamily: theme.bodyFont,
            lineHeight: 1.6,
            color: theme.inkMuted,
            verticalAlign: 'top',
          }),
        ],
      }),
  },
  {
    id: 'two-column',
    name: 'Two columns',
    build: (w, h, theme) =>
      createPage({
        name: 'Two columns',
        background: structuredClone(theme.pageBackground),
        elements: [
          createText({
            name: 'Heading',
            text: 'Two column layout',
            x: w * 0.09,
            y: h * 0.09,
            w: w * 0.82,
            h: h * 0.09,
            fontSize: Math.round(w * 0.055),
            fontWeight: 800,
            fontFamily: theme.headingFont,
            color: theme.ink,
          }),
          ...(['Left column text.', 'Right column text.'] as const).map((text, i) =>
            createText({
              name: i === 0 ? 'Column A' : 'Column B',
              text,
              x: w * (i === 0 ? 0.09 : 0.52),
              y: h * 0.22,
              w: w * 0.39,
              h: h * 0.6,
              fontSize: Math.round(w * 0.026),
              lineHeight: 1.6,
              fontWeight: 400,
              fontFamily: theme.bodyFont,
              color: theme.inkMuted,
              verticalAlign: 'top',
            }),
          ),
        ],
      }),
  },
  {
    id: 'hero-image',
    name: 'Hero image',
    build: (w, h, theme) =>
      createPage({
        name: 'Hero',
        background: structuredClone(theme.pageBackground),
        elements: [
          createShape('rect', {
            name: 'Image frame',
            x: 0,
            y: 0,
            w,
            h: h * 0.58,
            radius: 0,
            fill: { kind: 'linear', from: theme.accent, to: theme.ink, angle: 140 },
          }),
          createText({
            name: 'Caption',
            text: 'Drop an image on the frame above',
            x: w * 0.1,
            y: h * 0.64,
            w: w * 0.8,
            h: h * 0.1,
            fontSize: Math.round(w * 0.04),
            fontWeight: 700,
            fontFamily: theme.headingFont,
            color: theme.ink,
          }),
        ],
      }),
  },
  {
    id: 'quote',
    name: 'Quote',
    build: (w, h, theme) =>
      createPage({
        name: 'Quote',
        background: { fill: { kind: 'solid', color: theme.surfaceAlt } },
        elements: [
          createText({
            name: 'Quote',
            text: '“Design is not just what it looks like. Design is how it works.”',
            x: w * 0.12,
            y: h * 0.34,
            w: w * 0.76,
            h: h * 0.24,
            fontSize: Math.round(w * 0.05),
            fontWeight: 700,
            fontFamily: theme.headingFont,
            align: 'center',
            color: theme.ink,
            lineHeight: 1.35,
          }),
          createText({
            name: 'Attribution',
            text: '— Steve Jobs',
            x: w * 0.12,
            y: h * 0.6,
            w: w * 0.76,
            h: h * 0.06,
            fontSize: Math.round(w * 0.026),
            fontWeight: 500,
            fontFamily: theme.bodyFont,
            align: 'center',
            color: theme.inkMuted,
          }),
        ],
      }),
  },
]
