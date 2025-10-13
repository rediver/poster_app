import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '../App'
import '../styles/globals.css'
import { logModule } from './debug'

logModule('src/mount-theme.tsx')

const ROOT_ID = 'poster-builder-root'

function mount() {
  const el = document.getElementById(ROOT_ID)
  if (!el) {
    console.warn(`[poster-builder] Mount element #${ROOT_ID} not found`)
    return
  }
  ReactDOM.createRoot(el).render(<App />)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount)
} else {
  mount()
}