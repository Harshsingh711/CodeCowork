import { api } from '../api'

export function Titlebar() {
  return (
    <div className="titlebar h-10 flex items-center justify-between px-3 border-b border-line">
      <div className="flex items-center gap-2 text-sm text-white/80">
        <div className="w-5 h-5 rounded-md bg-accent/20 border border-accent/40 grid place-items-center text-accent">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
        </div>
        <span className="font-medium">Coworker</span>
      </div>
      <div className="no-drag flex items-center gap-1">
        <WinBtn onClick={() => api.window.minimize()} label="minimize">
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5h10" stroke="currentColor" strokeWidth="1"/></svg>
        </WinBtn>
        <WinBtn onClick={() => api.window.toggleMax()} label="maximize">
          <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1"/></svg>
        </WinBtn>
        <WinBtn onClick={() => api.window.close()} label="close" danger>
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1"/></svg>
        </WinBtn>
      </div>
    </div>
  )
}

function WinBtn({ children, onClick, label, danger }: { children: React.ReactNode; onClick: () => void; label: string; danger?: boolean }) {
  return (
    <button aria-label={label} onClick={onClick}
      className={`w-8 h-7 grid place-items-center rounded-md text-white/60 hover:text-white
        ${danger ? 'hover:bg-red-500/70' : 'hover:bg-white/10'} transition-colors`}>
      {children}
    </button>
  )
}
