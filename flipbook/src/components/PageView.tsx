import type { CSSProperties } from 'react'
import type { DocSettings, FlipPage } from '../shared/types'
import { pageBackgroundStyle, type SrcResolver } from '../lib/style'
import { ElementView } from './ElementView'

interface Props {
  page: FlipPage
  settings: DocSettings
  resolve: SrcResolver
  animate?: boolean
  editingTextId?: string | null
  className?: string
  style?: CSSProperties
  children?: React.ReactNode
}

/** A full page surface at 1:1 document scale; callers scale it with a transform. */
export function PageView({
  page,
  settings,
  resolve,
  animate,
  editingTextId,
  className,
  style,
  children,
}: Props) {
  return (
    <div
      className={`fb-page ${className ?? ''}`}
      data-page-id={page.id}
      style={{
        position: 'relative',
        width: settings.width,
        height: settings.height,
        overflow: 'hidden',
        ...pageBackgroundStyle(page.background, resolve),
        ...style,
      }}
    >
      {page.elements.map((el) => (
        <ElementView
          key={el.id}
          element={el}
          resolve={resolve}
          animate={animate}
          suppressed={editingTextId === el.id}
        />
      ))}
      {children}
    </div>
  )
}
