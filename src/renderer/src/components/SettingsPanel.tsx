import { useState } from 'react'
import type { Settings } from '../../../shared/types'

const PERSONA_PRESETS = [
  { name: 'Grounded (default)', text: 'Warm, concise, and precise. Flag uncertainty plainly.' },
  { name: 'Terse senior engineer', text: 'Direct, no filler, no apologies. Short sentences. Code first.' },
  { name: 'Patient teacher', text: 'Explain things from first principles. Use short analogies when useful.' },
  { name: 'Playful rubber-duck', text: 'Curious and informal. Think out loud a little, but stay grounded in evidence.' }
]

export function SettingsPanel({ settings, update, pickWorkspace }: {
  settings: Settings
  update: (patch: Partial<Settings>) => Promise<void>
  pickWorkspace: () => Promise<void>
}) {
  const [showKey, setShowKey] = useState(false)
  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-6 animate-in">
        <h2 className="text-xl font-semibold">Settings</h2>

        <Section title="OpenAI API key" hint="Required for the realtime voice session. Stored locally; sent only to OpenAI.">
          <div className="flex gap-2">
            <input
              type={showKey ? 'text' : 'password'}
              value={settings.openaiKey}
              onChange={e => update({ openaiKey: e.target.value })}
              placeholder="sk-..."
              className="flex-1 bg-white/5 border border-line rounded-md px-3 h-9 text-sm outline-none focus:border-accent/50 allow-select font-mono"
            />
            <button className="btn" onClick={() => setShowKey(v => !v)}>{showKey ? 'Hide' : 'Show'}</button>
          </div>
        </Section>

        <Section title="Voice" hint="Case-insensitive. Try: gleam, alloy, echo, shimmer, ash, ballad, coral, sage, verse.">
          <input
            type="text"
            value={settings.voice}
            onChange={e => update({ voice: e.target.value })}
            placeholder="gleam"
            className="w-full bg-white/5 border border-line rounded-md px-3 h-9 text-sm outline-none focus:border-accent/50 allow-select font-mono"
          />
        </Section>

        <Section title="Voice model" hint="OpenAI Live routes reasoning to a delegated model (gpt-6-luna).">
          <select
            value={settings.realtimeModel}
            onChange={e => update({ realtimeModel: e.target.value })}
            className="bg-white/5 border border-line rounded-md px-3 h-9 text-sm outline-none focus:border-accent/50 w-full">
            <option value="gpt-live-1">gpt-live-1 (Live, delegated reasoning)</option>
          </select>
        </Section>

        <Section title="Anthropic API key" hint="Optional, used for deep code investigation (text mode).">
          <div className="flex gap-2">
            <input
              type="password"
              value={settings.apiKey}
              onChange={e => update({ apiKey: e.target.value })}
              placeholder="sk-ant-..."
              className="flex-1 bg-white/5 border border-line rounded-md px-3 h-9 text-sm outline-none focus:border-accent/50 allow-select font-mono"
            />
          </div>
        </Section>

        <Section title="Workspace folder" hint="The repository Coworker is allowed to read.">
          <div className="flex gap-2 items-center">
            <div className="flex-1 bg-white/5 border border-line rounded-md px-3 h-9 text-sm flex items-center text-white/80 truncate allow-select">
              {settings.workspacePath ?? <span className="text-white/40">Not connected</span>}
            </div>
            <button className="btn" onClick={pickWorkspace}>Choose…</button>
          </div>
        </Section>

        <Section title="Verbosity">
          <div className="flex gap-2">
            {(['brief', 'balanced', 'detailed'] as const).map(v => (
              <button key={v} onClick={() => update({ verbosity: v })}
                className={`btn ${settings.verbosity === v ? 'bg-accent-soft border-accent/40 text-white' : ''}`}>
                {v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Personality" hint="How the coworker should sound. Pick a preset or write your own.">
          <div className="flex flex-wrap gap-2 mb-2">
            {PERSONA_PRESETS.map(p => (
              <button key={p.name} className="btn" onClick={() => update({ personality: p.text })}>
                {p.name}
              </button>
            ))}
          </div>
          <textarea
            value={settings.personality}
            onChange={e => update({ personality: e.target.value })}
            rows={3}
            className="w-full bg-white/5 border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-accent/50 allow-select resize-none"
          />
        </Section>
      </div>
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-xl p-4">
      <div className="mb-2">
        <div className="text-sm font-medium">{title}</div>
        {hint && <div className="text-xs text-white/50 mt-0.5">{hint}</div>}
      </div>
      {children}
    </div>
  )
}
