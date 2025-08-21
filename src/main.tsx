import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '../App'
import '../styles/globals.css'
import { logModule, logStylesheets, DEBUG_LOAD, assertStylesheets, assertStylesheetsFromEnv } from './debug'
logModule('src/main.tsx')

// Log stylesheet summary on startup when debug is enabled
if (DEBUG_LOAD) {
  // Defer to next tick to allow Vite to inject CSS
  setTimeout(() => {
    try {
      logStylesheets();
      // Verify key stylesheet modules are present
      assertStylesheets(['styles/globals.css']);
      // Optionally verify external CDN styles via DEBUG_EXPECT_STYLES or VITE_DEBUG_EXPECT_STYLES
      assertStylesheetsFromEnv();
    } catch {}
  }, 0);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />
)

