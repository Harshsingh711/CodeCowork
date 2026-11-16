import type { Settings } from '../../../shared/types'

type View = 'voice' | 'settings'

export function Sidebar({ view, onView, settings }: { view: View; onView: (v: View) => void; settings: Settings }) {
  return (
    <aside className="glass rounded-panel m-2 mr-0 w-14 compact:w-52 shrink-0 flex flex-col overflow-hidden">
      <nav aria-label="Main" className="p-2 flex flex-col gap-1">
        <Item icon="mic" label="Voice session" active={view === 'voice'} onClick={() => onView('voice')} />
        <Item icon="gear" label="Settings" active={view === 'settings'} onClick={() => onView('settings')} />
      </nav>
      <div className="mt-auto p-3 border-t border-line hidden compact:block" title={settings.workspacePath ?? undefined}>
        <div className="label-caps mb-0.5">Workspace</div>
        <div className="truncate text-xs text-fg-muted font-mono">
          {settings.workspacePath ? basename(settings.workspacePath) : 'Not connected'}
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
    <button onClick={onClick} aria-current={active ? 'page' : undefined} aria-label={label} title={label}
      className="nav-item justify-center compact:justify-start">
      <Icon name={icon} />
      <span className="hidden compact:inline">{label}</span>
    </button>
  )
}

function Icon({ name }: { name: 'mic' | 'gear' }) {
  if (name === 'mic') return (
    <svg className="shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3"/>
    </svg>
  )
  return (
    <svg className="shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  )
}
