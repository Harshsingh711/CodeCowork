import type { Settings } from '../../../shared/types'

type View = 'voice' | 'settings'

export function Sidebar({ view, onView, settings }: { view: View; onView: (v: View) => void; settings: Settings }) {
  return (
    <aside className="w-56 shrink-0 border-r border-line flex flex-col">
      <div className="p-3 flex flex-col gap-1">
        <Item icon="mic" label="Voice session" active={view === 'voice'} onClick={() => onView('voice')} />
        <Item icon="gear" label="Settings" active={view === 'settings'} onClick={() => onView('settings')} />
      </div>
      <div className="mt-auto p-3 text-[11px] text-white/40 border-t border-line">
        <div className="truncate">
          {settings.workspacePath ? (
            <><span className="text-white/60">Workspace</span><br/><span className="text-white/80">{basename(settings.workspacePath)}</span></>
          ) : 'No workspace connected'}
        </div>
      </div>
    </aside>
  )
}

function basename(p: string) {
  return p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? p
}

function Item({ icon, label, active, onClick }: { icon: 'mic' | 'gear'; label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-2.5 px-3 h-9 rounded-md text-sm transition-colors text-left
        ${active ? 'bg-accent-soft text-white border border-accent/30' : 'text-white/70 hover:text-white hover:bg-white/5 border border-transparent'}`}>
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  )
}

function Icon({ name }: { name: 'mic' | 'gear' }) {
  if (name === 'mic') return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3"/>
    </svg>
  )
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  )
}
