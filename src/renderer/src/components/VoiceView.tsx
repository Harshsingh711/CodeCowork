import { useEffect, useRef, useState } from 'react'
import { useVoice } from '../useVoice'
import type { RawEvent } from '../useVoice'
import type { Note, TranscriptEntry } from '../../../shared/types'
import { api } from '../api'
import { VoiceOrb } from './VoiceOrb'
import { Markdown } from './Markdown'
import { SourceRow } from './SourceRow'

export function VoiceView({ onNeedsSetup }: { onNeedsSetup: () => void }) {
  const v = useVoice()
  const transcriptEnd = useRef<HTMLDivElement>(null)
  useEffect(() => { transcriptEnd.current?.scrollIntoView({ behavior: 'smooth' }) }, [v.transcript])

  const isLive = v.status !== 'idle' && v.status !== 'error'

  return (
    <div className="flex-1 flex min-h-0">
      <section className="flex-1 min-w-0 flex flex-col px-4 pt-6 pb-4">
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center">
        <VoiceOrb status={v.status} level={v.micLevel} analysers={v.analysers} />

        <div className="mt-8 flex items-center gap-3">
          {!isLive ? (
            <button className="btn-primary !h-10 !px-5" onClick={v.start}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3"/></svg>
              Start voice session
            </button>
          ) : (
            <>
              {v.status === 'speaking' && (
                <button className="btn" onClick={v.interrupt}>Interrupt</button>
              )}
              <button className="btn" onClick={v.stop}>End session</button>
            </>
          )}
        </div>
        </div>

        {/* One stack in normal flow, so the error, the activity pill and the hint never cover the controls. */}
        <div className="shrink-0 pt-4 flex flex-col items-center gap-2">
          {v.error && (
            <div className="toast-error animate-in" role="alert">{v.error}</div>
          )}
          {v.toolBanner && (
            <div className="chip animate-in max-w-full" role="status">
              <span className="pulse-dot" aria-hidden="true"/>
              <span>{v.toolBanner.name}</span>
              <span className="font-mono text-2xs text-fg-subtle truncate">{v.toolBanner.summary}</span>
            </div>
          )}
          <p className="text-xs text-fg-subtle text-center">
            {v.status === 'idle' ? 'Press Start, then just talk.' : 'Talk any time. I\'ll stop when you do.'}
          </p>
        </div>
      </section>

      <aside className="glass rounded-panel m-2 ml-0 w-[44%] min-w-[300px] max-w-[440px] shrink-0 flex flex-col min-h-0 overflow-hidden">
        <TabbedSidePanel transcript={v.transcript} notes={v.notes} rawEvents={v.rawEvents} clearRaw={v.clearRaw} />
      </aside>
    </div>
  )
}

type TabId = 'transcript' | 'notes' | 'raw'

function TabbedSidePanel({ transcript, notes, rawEvents, clearRaw }: {
  transcript: TranscriptEntry[]
  notes: Note[]
  rawEvents: RawEvent[]
  clearRaw: () => void
}) {
  const [tab, setTab] = useState<TabId>('transcript')
  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: 'transcript', label: 'Transcript', count: transcript.length },
    { id: 'notes', label: 'Notes', count: notes.length },
    { id: 'raw', label: 'Raw', count: rawEvents.length }
  ]

  // Arrow keys move between tabs, as the tab pattern expects.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const i = tabs.findIndex(t => t.id === tab)
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]
    setTab(next.id)
    document.getElementById(`tab-${next.id}`)?.focus()
  }

  return (
    <>
      <div className="flex border-b border-line shrink-0" role="tablist" aria-label="Session panels" onKeyDown={onKeyDown}>
        {tabs.map(t => (
          <button key={t.id} id={`tab-${t.id}`} role="tab" className="tab"
            aria-selected={tab === t.id} aria-controls="session-panel" tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}>
            {t.label}
            {t.count > 0 && <span className="tab-count">{t.count}</span>}
          </button>
        ))}
      </div>
      <div id="session-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="flex-1 overflow-auto">
        {tab === 'transcript' ? <TranscriptPanel items={transcript}/>
          : tab === 'notes' ? <NotesPanel notes={notes}/>
          : <RawPanel events={rawEvents} onClear={clearRaw}/>}
      </div>
    </>
  )
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="p-6 text-sm leading-relaxed text-fg-subtle">{children}</p>
}

function TranscriptPanel({ items }: { items: TranscriptEntry[] }) {
  if (items.length === 0) {
    return <EmptyState>The live transcript will appear here as you talk.</EmptyState>
  }
  return (
    <div className="p-4 flex flex-col gap-5">
      {items.map(e => {
        const isUser = e.role === 'user'
        return (
          <div key={e.id} className={`animate-in flex flex-col ${isUser ? 'items-end' : 'items-stretch'}`}>
            <div className={`label-caps mb-1.5 ${isUser ? '!text-accent-strong' : ''}`}>
              {isUser ? 'You' : 'Coworker'}{e.partial ? ' · live' : ''}
            </div>
            {isUser ? (
              <div className="max-w-[90%] rounded-card rounded-br-[4px] px-3 py-2 bg-accent-soft border border-accent-line text-sm leading-relaxed text-fg allow-select">
                {e.text || <span className="text-fg-subtle">…</span>}
              </div>
            ) : e.text
              ? <Markdown text={e.text} />
              : <div className="text-sm leading-relaxed text-fg-subtle">…</div>}
            {!isUser && (
              // Greetings and one-liners don't need a "no sources" flag; real answers do.
              <SourceRow sources={e.sources ?? []} settled={!e.partial && e.text.trim().split(/\s+/).length >= 12} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function RawPanel({ events, onClear }: { events: RawEvent[]; onClear: () => void }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  if (events.length === 0) {
    return <EmptyState>Raw data-channel events will stream here once a session starts.</EmptyState>
  }
  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-3 py-2 border-b border-line bg-bg-raised backdrop-blur-glass">
        <div className="text-xs text-fg-subtle tabular-nums">{events.length} events</div>
        <button className="btn !h-7 text-xs" onClick={onClear}>Clear</button>
      </div>
      <div className="p-2 flex flex-col gap-1 font-mono text-2xs">
        {events.slice().reverse().map(e => {
          const isOpen = expanded === e.id
          const out = e.direction === 'out'
          const colorClass =
            out ? 'text-accent-strong' :
            e.type.includes('error') ? 'text-danger-fg' :
            e.type.includes('delta') ? 'text-fg-subtle' :
            'text-fg'
          return (
            <div key={e.id} className="border border-line rounded-control bg-bg-field overflow-hidden">
              <button className="w-full text-left px-2 py-1.5 flex items-center gap-2 hover:bg-bg-hover transition-colors duration-fast"
                aria-expanded={isOpen}
                onClick={() => setExpanded(isOpen ? null : e.id)}>
                <svg className={`shrink-0 ${out ? 'text-accent-strong' : 'text-fg-subtle'}`} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={out ? 'Sent' : 'Received'}>
                  {out ? <path d="M5 12h14M13 6l6 6-6 6"/> : <path d="M19 12H5M11 6l-6 6 6 6"/>}
                </svg>
                <span className="shrink-0 text-fg-subtle tabular-nums">{new Date(e.ts).toLocaleTimeString()}</span>
                <span className={`truncate ${colorClass}`}>{e.type}</span>
              </button>
              {isOpen && (
                <pre className="allow-select px-2 py-1.5 text-2xs text-fg-muted whitespace-pre-wrap break-all bg-bg-inset border-t border-line max-h-60 overflow-auto">
{safeStringify(e.payload)}
                </pre>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function safeStringify(obj: unknown): string {
  try {
    return JSON.stringify(obj, (_k, v) => typeof v === 'string' && v.length > 400 ? v.slice(0, 400) + '…' : v, 2)
  } catch { return String(obj) }
}

function NotesPanel({ notes }: { notes: Note[] }) {
  if (notes.length === 0) {
    return (
      <EmptyState>
        Ask Coworker to "write it down" or "save that", by voice or in the text bar, and the note lands here.
      </EmptyState>
    )
  }
  return (
    <div className="p-4 flex flex-col gap-3">
      {notes.map(n => (
        <div key={n.id} className="rounded-card p-3 bg-bg-field border border-line animate-in">
          <div className="flex items-start gap-2 mb-1">
            <div className="flex-1 min-w-0 text-sm font-semibold text-fg allow-select">{n.title}</div>
            <button className="note-delete" aria-label={`Delete note: ${n.title}`} title="Delete note" onClick={() => api.notes.remove(n.id)}>
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
            </button>
          </div>
          <Markdown text={n.body} />
          <div className="text-2xs text-fg-subtle tabular-nums mt-2">{new Date(n.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</div>
        </div>
      ))}
    </div>
  )
}
