import React from 'react'
import ReactDOM from 'react-dom/client'
import { api } from './api'
import './index.css'

function Control() {
  return (
    <div className="h-full w-full p-2">
      <div className="glass-float rounded-card h-full relative flex items-center gap-2.5 pl-3 pr-8 titlebar">
        <div className="brand-mark w-8 h-8 !rounded-control no-drag" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
        </div>
        <div className="flex-1 min-w-0 no-drag">
          <div className="text-xs text-fg font-semibold leading-tight">Coworker</div>
          <div className="text-2xs text-fg-muted leading-tight">Ctrl+Shift+Space to ask</div>
        </div>
        <button className="btn no-drag !h-7" onClick={() => api.showMain()}>Open</button>
        <button className="float-close no-drag" aria-label="Quit Coworker" title="Quit Coworker" onClick={() => api.quit()}>
          <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
        </button>
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('control-root')!).render(<Control />)
