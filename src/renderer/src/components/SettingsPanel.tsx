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
    <div className="flex-1 overflow-auto px-4 py-6 compact:px-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-4 animate-in">
        <h2 className="text-xl font-semibold tracking-tight mb-1">Settings</h2>

        <Section htmlFor="set-openai" title="OpenAI API key" hint="Required for the realtime voice session. Stored locally; sent only to OpenAI.">
          <div className="flex gap-2">
            <input
              type={showKey ? 'text' : 'password'}
              id="set-openai"
              value={settings.openaiKey}
              onChange={e => update({ openaiKey: e.target.value })}
              placeholder="sk-..."
              className="field flex-1 allow-select font-mono"
            />
            <button className="btn !h-9" aria-pressed={showKey} aria-label={showKey ? 'Hide OpenAI API key' : 'Show OpenAI API key'} onClick={() => setShowKey(v => !v)}>{showKey ? 'Hide' : 'Show'}</button>
          </div>
        </Section>

        <Section htmlFor="set-voice" title="Voice" hint="Case-insensitive. Try: gleam, alloy, echo, shimmer, ash, ballad, coral, sage, verse.">
          <input
            type="text"
            id="set-voice"
            value={settings.voice}
            onChange={e => update({ voice: e.target.value })}
            placeholder="gleam"
            className="field allow-select font-mono"
          />
        </Section>

        <Section htmlFor="set-model" title="Voice model" hint="OpenAI Live routes reasoning to a delegated model (gpt-6-luna).">
          <select
            id="set-model"
            value={settings.realtimeModel}
            onChange={e => update({ realtimeModel: e.target.value })}
            className="field">
            <option value="gpt-live-1">gpt-live-1 (Live, delegated reasoning)</option>
          </select>
        </Section>

        <Section htmlFor="set-anthropic" title="Anthropic API key" hint="Optional, used for deep code investigation (text mode).">
          <div className="flex gap-2">
            <input
              type="password"
              id="set-anthropic"
              value={settings.apiKey}
              onChange={e => update({ apiKey: e.target.value })}
              placeholder="sk-ant-..."
              className="field flex-1 allow-select font-mono"
            />
          </div>
        </Section>

        <Section title="Workspace folder" hint="The repository Coworker is allowed to read.">
          <div className="flex gap-2 items-center">
            <div id="set-workspace" className="field flex-1 min-w-0 flex items-center font-mono text-fg-muted allow-select" title={settings.workspacePath ?? undefined}>
              <span className="truncate">{settings.workspacePath ?? <span className="text-fg-subtle">Not connected</span>}</span>
            </div>
            <button className="btn !h-9" onClick={pickWorkspace}>Choose…</button>
          </div>
        </Section>

        <Section title="Verbosity">
          <div className="flex gap-2" role="group" aria-label="Verbosity">
            {(['brief', 'balanced', 'detailed'] as const).map(v => (
              <button key={v} onClick={() => update({ verbosity: v })}
                aria-pressed={settings.verbosity === v} className="btn">
                {v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </Section>

        <Section htmlFor="set-personality" title="Personality" hint="How the coworker should sound. Pick a preset or write your own.">
          <div className="flex flex-wrap gap-2 mb-2">
            {PERSONA_PRESETS.map(p => (
              <button key={p.name} className="btn" aria-pressed={settings.personality === p.text} onClick={() => update({ personality: p.text })}>
                {p.name}
              </button>
            ))}
          </div>
          <textarea
            id="set-personality"
            value={settings.personality}
            onChange={e => update({ personality: e.target.value })}
            rows={3}
            className="field allow-select resize-none"
          />
        </Section>
      </div>
    </div>
  )
}

function Section({ title, hint, htmlFor, children }: { title: string; hint?: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-card p-4">
      <div className="mb-3">
        {htmlFor
          ? <label htmlFor={htmlFor} className="block text-sm font-medium text-fg">{title}</label>
          : <div className="text-sm font-medium text-fg">{title}</div>}
        {hint && <div className="text-xs leading-relaxed text-fg-muted mt-0.5">{hint}</div>}
      </div>
      {children}
    </div>
  )
}
