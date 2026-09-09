import type { FlipPage } from '../shared/types'
import { createPage, createShape, createText } from './factory'

export interface PageTemplate {
  id: string
  name: string
  build: (w: number, h: number) => FlipPage
}

const ACCENT = '#6c5ce7'
const INK = '#12141a'

export const PAGE_TEMPLATES: PageTemplate[] = [
  {
    id: 'blank',
    name: 'Blank',
    build: () => createPage({ name: 'Blank' }),
  },
  {
    id: 'cover',
    name: 'Cover',
    build: (w, h) =>
      createPage({
        name: 'Cover',
        background: { fill: { kind: 'linear', from: '#221a4b', to: '#0f1020', angle: 160 } },
        elements: [
          createShape('rect', {
            name: 'Accent bar',
            x: w * 0.12,
            y: h * 0.42,
            w: w * 0.18,
            h: 10,
            radius: 6,
            fill: { kind: 'solid', color: ACCENT },
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
            color: '#ffffff',
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
            color: 'rgba(255,255,255,.72)',
          }),
        ],
      }),
  },
  {
    id: 'title-body',
    name: 'Title + body',
    build: (w, h) =>
      createPage({
        name: 'Article',
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
            color: INK,
          }),
          createShape('rect', {
            name: 'Rule',
            x: w * 0.1,
            y: h * 0.21,
            w: w * 0.12,
            h: 6,
            radius: 3,
            fill: { kind: 'solid', color: ACCENT },
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
            lineHeight: 1.6,
            color: '#3a3f4b',
            verticalAlign: 'top',
          }),
        ],
      }),
  },
  {
    id: 'two-column',
    name: 'Two columns',
    build: (w, h) =>
      createPage({
        name: 'Two columns',
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
            color: INK,
          }),
          createText({
            name: 'Column A',
            text: 'Left column text.',
            x: w * 0.09,
            y: h * 0.22,
            w: w * 0.39,
            h: h * 0.6,
            fontSize: Math.round(w * 0.026),
            lineHeight: 1.6,
            fontWeight: 400,
            color: '#3a3f4b',
            verticalAlign: 'top',
          }),
          createText({
            name: 'Column B',
            text: 'Right column text.',
            x: w * 0.52,
            y: h * 0.22,
            w: w * 0.39,
            h: h * 0.6,
            fontSize: Math.round(w * 0.026),
            lineHeight: 1.6,
            fontWeight: 400,
            color: '#3a3f4b',
            verticalAlign: 'top',
          }),
        ],
      }),
  },
  {
    id: 'hero-image',
    name: 'Hero image',
    build: (w, h) =>
      createPage({
        name: 'Hero',
        elements: [
          createShape('rect', {
            name: 'Image frame',
            x: 0,
            y: 0,
            w,
            h: h * 0.58,
            radius: 0,
            fill: { kind: 'linear', from: '#8e7bff', to: '#37306b', angle: 140 },
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
            color: INK,
          }),
        ],
      }),
  },
  {
    id: 'quote',
    name: 'Quote',
    build: (w, h) =>
      createPage({
        name: 'Quote',
        background: { fill: { kind: 'solid', color: '#f4f2ff' } },
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
            align: 'center',
            color: '#2b2350',
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
            align: 'center',
            color: '#6b6494',
          }),
        ],
      }),
  },
]
