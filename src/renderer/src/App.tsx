import { useEffect, useState } from 'react'
import { api } from './api'
import type { Settings } from '../../shared/types'
import { Titlebar } from './components/Titlebar'
import { Sidebar } from './components/Sidebar'
import { SettingsPanel } from './components/SettingsPanel'
import { VoiceView } from './components/VoiceView'

type View = 'voice' | 'settings'

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [view, setView] = useState<View>('voice')

  useEffect(() => { api.getSettings().then(setSettings) }, [])

  const update = async (patch: Partial<Settings>) => {
    const s = await api.setSettings(patch)
    setSettings(s)
  }

  const pickWorkspace = async () => {
    const p = await api.pickWorkspace()
    if (p) setSettings(prev => prev ? { ...prev, workspacePath: p } : prev)
  }

  if (!settings) return <div className="h-full gradient-bg" />

  const needsSetup = !settings.openaiKey || !settings.workspacePath

  return (
    <div className="h-full flex flex-col gradient-bg">
      <Titlebar />
      <div className="flex-1 flex min-h-0">
        <Sidebar view={view} onView={setView} settings={settings} />
        <main className="flex-1 flex flex-col min-w-0 min-h-0">
          {view === 'settings' && (
            <SettingsPanel settings={settings} update={update} pickWorkspace={pickWorkspace} />
          )}
          {view === 'voice' && (
            needsSetup
              ? <SetupPrompt onSetup={() => setView('settings')} />
              : <VoiceView onNeedsSetup={() => setView('settings')} />
          )}
        </main>
      </div>
    </div>
  )
}

function SetupPrompt({ onSetup }: { onSetup: () => void }) {
  return (
    <div className="flex-1 grid place-items-center p-8 animate-in">
      <div className="glass rounded-panel p-8 max-w-md text-center">
        <div className="brand-mark w-12 h-12 !rounded-card mx-auto mb-4" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3"/></svg>
        </div>
        <h2 className="text-lg font-semibold tracking-tight mb-1">Set up your voice session</h2>
        <p className="text-sm text-fg-muted mb-5">Add your OpenAI API key and connect a workspace folder.</p>
        <button className="btn-primary" onClick={onSetup}>Open settings</button>
      </div>
    </div>
  )
}
