import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { PublishedViewer } from './PublishedViewer'
import './styles/app.css'

const root = createRoot(document.getElementById('root')!)

// `/v/<slug>` serves a published flipbook; everything else is the editor.
const match = window.location.pathname.match(/^\/v\/([\w-]+)\/?$/)

root.render(
  <StrictMode>{match ? <PublishedViewer slug={match[1]} /> : <App />}</StrictMode>,
)
