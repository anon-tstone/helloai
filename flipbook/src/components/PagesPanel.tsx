import { useMemo, useState } from 'react'
import { useEditor } from '../store/editor'
import { makeResolver } from '../lib/style'
import { PageView } from './PageView'

const THUMB_HEIGHT = 96

/**
 * The page strip: reorder by dragging, plus add / duplicate / delete.
 * Thumbnails are live renders of the real page, scaled with a transform.
 */
export function PagesPanel() {
  const doc = useEditor((s) => s.doc)
  const pageIndex = useEditor((s) => s.pageIndex)
  const setPageIndex = useEditor((s) => s.setPageIndex)
  const addPage = useEditor((s) => s.addPage)
  const duplicatePage = useEditor((s) => s.duplicatePage)
  const deletePage = useEditor((s) => s.deletePage)
  const movePage = useEditor((s) => s.movePage)
  const renamePage = useEditor((s) => s.renamePage)

  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)
  const [renaming, setRenaming] = useState<number | null>(null)

  const resolve = useMemo(() => makeResolver(doc), [doc])
  const scale = THUMB_HEIGHT / doc.settings.height
  const thumbWidth = Math.round(doc.settings.width * scale)

  return (
    <div className="pages-panel">
      <div className="pages-strip">
        {doc.pages.map((page, i) => (
          <div
            key={page.id}
            className={[
              'page-item',
              i === pageIndex ? 'active' : '',
              dropAt === i ? 'drop-target' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            draggable={renaming !== i}
            onDragStart={() => setDragFrom(i)}
            onDragOver={(e) => {
              e.preventDefault()
              setDropAt(i)
            }}
            onDragLeave={() => setDropAt((cur) => (cur === i ? null : cur))}
            onDrop={(e) => {
              e.preventDefault()
              if (dragFrom !== null && dragFrom !== i) movePage(dragFrom, i)
              setDragFrom(null)
              setDropAt(null)
            }}
            onDragEnd={() => {
              setDragFrom(null)
              setDropAt(null)
            }}
            onClick={() => setPageIndex(i)}
          >
            <div className="page-thumb" style={{ width: thumbWidth, height: THUMB_HEIGHT }}>
              <div
                className="page-thumb-inner"
                style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}
              >
                <PageView page={page} settings={doc.settings} resolve={resolve} />
              </div>
            </div>
            <div className="page-meta">
              <span className="page-no">{i + 1}</span>
              {renaming === i ? (
                <input
                  autoFocus
                  defaultValue={page.name}
                  onBlur={(e) => {
                    renamePage(i, e.target.value || `Page ${i + 1}`)
                    setRenaming(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    if (e.key === 'Escape') setRenaming(null)
                  }}
                />
              ) : (
                <span
                  className="page-name"
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    setRenaming(i)
                  }}
                >
                  {page.name}
                </span>
              )}
            </div>
            <div className="page-actions">
              <button
                title="Duplicate page"
                onClick={(e) => {
                  e.stopPropagation()
                  duplicatePage(i)
                }}
              >
                ⧉
              </button>
              <button
                title="Delete page"
                disabled={doc.pages.length <= 1}
                onClick={(e) => {
                  e.stopPropagation()
                  deletePage(i)
                }}
              >
                ✕
              </button>
            </div>
          </div>
        ))}

        <button className="page-add" onClick={() => addPage()} title="Add a page">
          <span>+</span>
          Add page
        </button>
      </div>
    </div>
  )
}
