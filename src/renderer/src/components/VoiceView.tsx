import { useEffect, useRef } from 'react'
import { useVoice } from '../useVoice'
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
      <section className="flex-1 flex flex-col items-center justify-center p-10 relative">
        <VoiceOrb status={v.status} level={v.micLevel} />

        <div className="mt-10 flex items-center gap-3">
          {!isLive ? (
            <button className="btn-primary px-5 h-10" onClick={v.start}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3"/></svg>
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

        {v.toolBanner && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 chip animate-in">
            <span className="pulse-dot"/>{v.toolBanner.name}: <span className="font-mono text-[11px] opacity-80 ml-1">{v.toolBanner.summary}</span>
          </div>
        )}

        {v.error && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 glass rounded-md px-3 py-2 text-xs text-red-200 animate-in">
            {v.error}
          </div>
        )}

        <div className="absolute bottom-4 right-6 text-[11px] text-white/40">
          {v.status === 'idle' ? 'Press Start, then just talk.' : 'Talk any time. I\'ll stop when you do.'}
        </div>
      </section>

      <aside className="w-[420px] border-l border-line flex flex-col min-h-0">
        <TabbedSidePanel transcript={v.transcript} notes={v.notes} rawEvents={v.rawEvents} clearRaw={v.clearRaw} />
      </aside>
    </div>
  )
}

import { useState } from 'react'
import type { Note, TranscriptEntry } from '../../../shared/types'
import type { RawEvent } from '../useVoice'

function TabbedSidePanel({ transcript, notes, rawEvents, clearRaw }: {
  transcript: TranscriptEntry[]
  notes: Note[]
  rawEvents: RawEvent[]
  clearRaw: () => void
}) {
  const [tab, setTab] = useState<'transcript' | 'notes' | 'raw'>('transcript')
  return (
    <>
      <div className="flex border-b border-line">
        <TabBtn active={tab === 'transcript'} onClick={() => setTab('transcript')}>
          Transcript {transcript.length > 0 && <span className="chip ml-1" style={{height: 18, padding: '0 6px', fontSize: 10}}>{transcript.length}</span>}
        </TabBtn>
        <TabBtn active={tab === 'notes'} onClick={() => setTab('notes')}>
          Notes {notes.length > 0 && <span className="chip ml-1" style={{height: 18, padding: '0 6px', fontSize: 10}}>{notes.length}</span>}
        </TabBtn>
        <TabBtn active={tab === 'raw'} onClick={() => setTab('raw')}>
          Raw {rawEvents.length > 0 && <span className="chip ml-1" style={{height: 18, padding: '0 6px', fontSize: 10}}>{rawEvents.length}</span>}
        </TabBtn>
      </div>
      <div className="flex-1 overflow-auto">
        {tab === 'transcript' ? <TranscriptPanel items={transcript}/>
          : tab === 'notes' ? <NotesPanel notes={notes}/>
          : <RawPanel events={rawEvents} onClear={clearRaw}/>}
      </div>
    </>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`flex-1 h-10 text-sm transition-colors ${active ? 'text-white border-b-2 border-accent -mb-px' : 'text-white/50 hover:text-white/80'}`}>
      {children}
    </button>
  )
}

function TranscriptPanel({ items }: { items: TranscriptEntry[] }) {
  if (items.length === 0) {
    return <div className="p-6 text-sm text-white/40">The live transcript will appear here as you talk.</div>
  }
  return (
    <div className="p-4 flex flex-col gap-5">
      {items.map(e => (
        <div key={e.id} className="animate-in">
          <div className={`text-[10px] uppercase tracking-wider mb-1 ${e.role === 'user' ? 'text-accent' : 'text-white/40'}`}>
            {e.role === 'user' ? 'You' : 'Coworker'}{e.partial ? ' · live' : ''}
          </div>
          {e.role === 'assistant' && e.text
            ? <Markdown text={e.text} />
            : <div className="text-sm leading-relaxed text-white/90 allow-select">{e.text || <span className="text-white/30">…</span>}</div>}
          {e.role === 'assistant' && (
            // Greetings and one-liners don't need a "no sources" flag; real answers do.
            <SourceRow sources={e.sources ?? []} settled={!e.partial && e.text.trim().split(/\s+/).length >= 12} />
          )}
        </div>
      ))}
    </div>
  )
}

function RawPanel({ events, onClear }: { events: RawEvent[]; onClear: () => void }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  if (events.length === 0) {
    return <div className="p-6 text-sm text-white/40">Raw data-channel events will stream here once a session starts.</div>
  }
  return (
    <div>
      <div className="sticky top-0 flex items-center justify-between gap-2 px-3 py-2 border-b border-line bg-bg-panel backdrop-blur-xl">
        <div className="text-[11px] text-white/50">{events.length} events</div>
        <button className="btn text-xs" style={{height: 24}} onClick={onClear}>Clear</button>
      </div>
      <div className="p-2 flex flex-col gap-1 font-mono text-[11px]">
        {events.slice().reverse().map(e => {
          const isOpen = expanded === e.id
          const colorClass =
            e.direction === 'out' ? 'text-accent' :
            e.type.includes('error') ? 'text-red-300' :
            e.type.includes('delta') ? 'text-white/55' :
            'text-white/85'
          return (
            <div key={e.id} className="border border-line rounded-md bg-white/[0.02] overflow-hidden">
              <button className="w-full text-left px-2 py-1 flex items-center gap-2 hover:bg-white/5"
                onClick={() => setExpanded(isOpen ? null : e.id)}>
                <span className={`shrink-0 text-[10px] ${e.direction === 'out' ? 'text-accent' : 'text-white/40'}`}>
                  {e.direction === 'out' ? '→' : '←'}
                </span>
                <span className="shrink-0 text-[10px] text-white/35">{new Date(e.ts).toLocaleTimeString()}</span>
                <span className={`truncate ${colorClass}`}>{e.type}</span>
              </button>
              {isOpen && (
                <pre className="allow-select px-2 py-1.5 text-[10.5px] text-white/80 whitespace-pre-wrap break-all bg-black/30 border-t border-line max-h-60 overflow-auto">
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
      <div className="p-6 text-sm text-white/40">
        Ask the coworker to "write it down" or "save that" — pinned findings land here.
      </div>
    )
  }
  return (
    <div className="p-4 flex flex-col gap-3">
      {notes.map(n => (
        <div key={n.id} className="glass rounded-lg p-3 animate-in">
          <div className="text-xs font-semibold text-white/90 mb-1">{n.title}</div>
          <Markdown text={n.body} />
          <div className="text-[10px] text-white/35 mt-2">{new Date(n.createdAt).toLocaleTimeString()}</div>
        </div>
      ))}
    </div>
  )
}
