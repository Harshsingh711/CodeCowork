import { api } from '../api'

export function Titlebar() {
  return (
    <div className="titlebar h-10 shrink-0 flex items-center justify-between pl-3 border-b border-line">
      <div className="flex items-center gap-2.5 text-sm text-fg">
        <div className="brand-mark w-5 h-5" aria-hidden="true">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
        </div>
        <span className="font-semibold tracking-tight">Coworker</span>
      </div>
      <div className="no-drag flex items-center">
        <WinBtn onClick={() => api.window.minimize()} label="Minimize">
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M0 5h10" stroke="currentColor" strokeWidth="1"/></svg>
        </WinBtn>
        <WinBtn onClick={() => api.window.toggleMax()} label="Maximize">
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1"/></svg>
        </WinBtn>
        <WinBtn onClick={() => api.window.close()} label="Close" danger>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1"/></svg>
        </WinBtn>
      </div>
    </div>
  )
}

function WinBtn({ children, onClick, label, danger }: { children: React.ReactNode; onClick: () => void; label: string; danger?: boolean }) {
  return (
    <button aria-label={label} title={label} onClick={onClick} className={`win-btn ${danger ? 'is-danger' : ''}`}>
      {children}
    </button>
  )
}
