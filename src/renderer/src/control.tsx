import React from 'react'
import ReactDOM from 'react-dom/client'
import { api } from './api'
import './index.css'

function Control() {
  return (
    <div className="h-full w-full p-2">
      <div className="glass-raised rounded-xl h-full flex items-center gap-2 px-3 titlebar"
           style={{ boxShadow: '0 10px 40px rgba(0,0,0,0.45)' }}>
        <div className="w-8 h-8 rounded-lg bg-accent/20 border border-accent/40 grid place-items-center text-accent no-drag">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
        </div>
        <div className="flex-1 min-w-0 no-drag">
          <div className="text-xs text-white/90 font-medium leading-tight">Coworker</div>
          <div className="text-[10px] text-white/50 leading-tight">Ctrl+Shift+Space to toggle</div>
        </div>
        <button className="btn no-drag" style={{height: 28}} onClick={() => api.showMain()}>Open</button>
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('control-root')!).render(<Control />)
