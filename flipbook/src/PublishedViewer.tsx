import { useEffect, useState } from 'react'
import type { FlipDoc } from './shared/types'
import { api } from './lib/api'
import { Reader } from './components/Reader'

/** Read-only view of a published flipbook, served at `/v/<slug>`. */
export function PublishedViewer({ slug }: { slug: string }) {
  const [doc, setDoc] = useState<FlipDoc | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .getPublished(slug)
      .then((res) => {
        setDoc(res.doc)
        document.title = res.doc.title
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [slug])

  if (error) {
    return (
      <div className="boot">
        <span className="logo">◪</span>
        <p>This flipbook is not available.</p>
        <p className="hint">{error}</p>
      </div>
    )
  }
  if (!doc) {
    return (
      <div className="boot">
        <span className="logo">◪</span>
        <p>Loading…</p>
      </div>
    )
  }
  return <Reader doc={doc} />
}
