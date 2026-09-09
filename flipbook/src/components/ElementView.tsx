import { memo, type CSSProperties } from 'react'
import type { FlipElement } from '../shared/types'
import {
  animationCss,
  frameStyle,
  imageStyle,
  lineGeometry,
  shapeBoxStyle,
  shapeIsBox,
  shapePath,
  fillToCss,
  textStyle,
  type SrcResolver,
} from '../lib/style'

interface Props {
  element: FlipElement
  resolve: SrcResolver
  /** Play entrance animations (reader/export preview), off inside the editor. */
  animate?: boolean
  /** Hidden while the inline text editor takes over the element. */
  suppressed?: boolean
}

/**
 * Renders one element exactly as the offline export will render it: both use
 * the style helpers in `lib/style`.
 */
function ElementViewImpl({ element, resolve, animate = false, suppressed = false }: Props) {
  const style = {
    ...frameStyle(element),
    ...(animate ? animationCss(element) : {}),
    ...(suppressed ? { visibility: 'hidden' as const } : {}),
  } as CSSProperties

  return (
    <div className="fb-el" data-el-id={element.id} data-type={element.type} style={style}>
      {renderContent(element, resolve)}
    </div>
  )
}

function renderContent(el: FlipElement, resolve: SrcResolver) {
  switch (el.type) {
    case 'text':
      return <div style={textStyle(el) as CSSProperties}>{el.text}</div>

    case 'image': {
      const src = resolve(el.src)
      if (!src) return <div className="fb-el-placeholder">No image</div>
      return <img src={src} alt={el.name} style={imageStyle(el) as CSSProperties} draggable={false} />
    }

    case 'shape': {
      if (shapeIsBox(el.shape)) {
        return <div style={shapeBoxStyle(el) as CSSProperties} />
      }
      const gradientId = `grad-${el.id}`
      const fill = el.fill
      return (
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}
        >
          {fill.kind === 'linear' && (
            <defs>
              <linearGradient id={gradientId} gradientTransform={`rotate(${fill.angle} .5 .5)`}>
                <stop offset="0%" stopColor={fill.from} />
                <stop offset="100%" stopColor={fill.to} />
              </linearGradient>
            </defs>
          )}
          <path
            d={shapePath(el.shape)}
            fill={fill.kind === 'linear' ? `url(#${gradientId})` : fillToCss(fill)}
            stroke={el.strokeWidth > 0 ? el.stroke : 'none'}
            strokeWidth={el.strokeWidth}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )
    }

    case 'line': {
      const g = lineGeometry(el)
      const markerId = `cap-${el.id}`
      return (
        <svg style={{ width: '100%', height: '100%', overflow: 'visible' }}>
          <defs>
            <marker
              id={`${markerId}-arrow`}
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="5"
              orient="auto"
            >
              <path d="M0 0 L10 5 L0 10 Z" fill={el.stroke} />
            </marker>
            <marker id={`${markerId}-dot`} markerWidth="8" markerHeight="8" refX="4" refY="4">
              <circle cx="4" cy="4" r="3.5" fill={el.stroke} />
            </marker>
          </defs>
          <line
            x1={g.x1}
            y1={g.y1}
            x2={g.x2}
            y2={g.y2}
            stroke={el.stroke}
            strokeWidth={el.strokeWidth}
            strokeLinecap="round"
            strokeDasharray={el.dash.length ? el.dash.join(' ') : undefined}
            markerStart={el.startCap !== 'none' ? `url(#${markerId}-${el.startCap})` : undefined}
            markerEnd={el.endCap !== 'none' ? `url(#${markerId}-${el.endCap})` : undefined}
          />
        </svg>
      )
    }

    case 'video': {
      const src = resolve(el.src)
      return (
        <video
          src={src}
          poster={el.poster ? resolve(el.poster) : undefined}
          autoPlay={el.autoplay}
          loop={el.loop}
          muted={el.muted}
          controls={el.controls}
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )
    }

    case 'embed':
      return (
        <div
          style={{ width: '100%', height: '100%' }}
          dangerouslySetInnerHTML={{ __html: el.html }}
        />
      )
  }
}

export const ElementView = memo(ElementViewImpl)
