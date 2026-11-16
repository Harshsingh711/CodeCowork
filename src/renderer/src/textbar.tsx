import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { api } from './api'
import type { SourceLookup } from '../../shared/types'
import { Markdown } from './components/Markdown'
import { SourceRow } from './components/SourceRow'
import './index.css'

/** One question and its answer. */
type Turn = {
  id: string
  question: string
  text: string
  sources: SourceLookup[]
  /** Notes this answer saved to the Notes panel. */
  saved: { id: string; title: string; ok: boolean | null }[]
  streaming: boolean
  usedScreen: boolean
  error?: string
  cancelled?: boolean
}

const SUGGESTIONS = [
  { icon: 'screen', text: 'What am I looking at right now?' },
  { icon: 'map', text: 'Give me a tour of this project' },
  { icon: 'search', text: 'Where does this app start running?' }
] as const

const EXIT_MS = 130
const MAX_INPUT_HEIGHT = 204 // about eight lines
let measureCanvas: HTMLCanvasElement | null = null
const KIND: Record<string, SourceLookup['kind'] | undefined> = { read_file: 'read', grep: 'search', list_dir: 'list' }

function TextBar() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [shareScreen, setShareScreen] = useState(true)
  const [hasScreen, setHasScreen] = useState(false)
  const [workspace, setWorkspace] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  // Once the question no longer fits on one line, the text takes the full width and the controls drop to a row below.
  const [multiline, setMultiline] = useState(false)
  const oneLineWidth = useRef(0)
  const threadRef = useRef<HTMLDivElement>(null)
  const activeId = useRef<string | null>(null)
  const unsubscribe = useRef<(() => void) | null>(null)

  const busy = turns.some(t => t.streaming)

  // Appear: main shows the window, then tells us; the next frame starts the pop-in.
  useEffect(() => api.textbar.onShown(info => {
    setHasScreen(info.hasScreen)
    api.getSettings().then(s => {
      setShareScreen(s.shareScreen !== false)
      setWorkspace(s.workspacePath ? s.workspacePath.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? null : null)
    })
    requestAnimationFrame(() => {
      setOpen(true)
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }), [])

  // Disappear: play the exit, then let main hide the window.
  const dismiss = () => {
    setOpen(false)
    window.setTimeout(() => api.textbar.hide(), EXIT_MS)
  }
  useEffect(() => api.textbar.onHideRequest(dismiss), [])

  // The window is exactly as tall as the content, so it never blocks clicks around the bar.
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const report = () => api.textbar.resize(el.offsetHeight)
    const ro = new ResizeObserver(report)
    ro.observe(el)
    report()
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [turns])

  // Wrap instead of scrolling sideways, and grow with the text (up to MAX_INPUT_HEIGHT, then scroll).
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    const cs = getComputedStyle(el)
    // Width available to text while everything sits on one row; remembered for deciding when to go back.
    if (!multiline) oneLineWidth.current = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
    const ctx = (measureCanvas ??= document.createElement('canvas')).getContext('2d')
    let needsWrap = input.includes('\n')
    if (!needsWrap && ctx && oneLineWidth.current > 0) {
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
      needsWrap = ctx.measureText(input).width > oneLineWidth.current - 6
    }
    if (needsWrap !== multiline) { setMultiline(needsWrap); return } // re-runs with the new layout
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, MAX_INPUT_HEIGHT) + 'px'
  }, [input, multiline])

  const patch = (id: string, fn: (t: Turn) => Turn) => setTurns(prev => prev.map(t => t.id === id ? fn(t) : t))

  const send = async (text: string) => {
    const question = text.trim()
    if (!question || busy) return
    const id = Math.random().toString(36).slice(2)
    const usedScreen = shareScreen && hasScreen
    // Earlier turns go along as plain text so follow-up questions have context.
    const history = turns.filter(t => t.text && !t.error).flatMap(t => [
      { role: 'user' as const, content: t.question },
      { role: 'assistant' as const, content: t.text }
    ])
    setTurns(prev => [...prev, { id, question, text: '', sources: [], saved: [], streaming: true, usedScreen }])
    setInput('')
    activeId.current = id

    unsubscribe.current?.()
    unsubscribe.current = api.investigate.onEvent(id, ev => {
      if (ev.type === 'text_delta') {
        patch(id, t => ({ ...t, text: t.text + ev.delta }))
      } else if (ev.type === 'tool_start') {
        const kind = KIND[ev.name]
        patch(id, t => ({
          ...t,
          // Text written before a lookup and after it are separate paragraphs.
          text: t.text && !t.text.endsWith('\n') ? t.text + '\n\n' : t.text,
          saved: ev.name === 'write_note' ? [...t.saved, { id: ev.id, title: String(ev.input?.title ?? 'Note'), ok: null }] : t.saved,
          sources: kind ? [...t.sources, {
            id: ev.id, kind, status: 'running',
            path: kind === 'search' ? undefined : String(ev.input?.path ?? '.'),
            startLine: ev.input?.start_line, endLine: ev.input?.end_line,
            pattern: kind === 'search' ? String(ev.input?.pattern ?? '') : undefined
          }] : t.sources
        }))
      } else if (ev.type === 'tool_done' || ev.type === 'tool_error') {
        patch(id, t => ({
          ...t,
          saved: t.saved.map(n => n.id === ev.id ? { ...n, ok: ev.type === 'tool_done' } : n),
          sources: t.sources.map(s => s.id === ev.id
            ? { ...s, status: ev.type === 'tool_done' ? 'done' : 'error', error: ev.error }
            : s)
        }))
      } else if (ev.type === 'done' || ev.type === 'cancelled' || ev.type === 'error') {
        patch(id, t => ({
          ...t,
          streaming: false,
          cancelled: ev.type === 'cancelled',
          error: ev.type === 'error' ? String(ev.error ?? 'Something went wrong') : undefined,
          // Lookups still marked running were cut short.
          sources: t.sources.map(s => s.status === 'running' ? { ...s, status: 'error', error: 'Stopped' } : s)
        }))
        activeId.current = null
      }
    })

    const res = await api.investigate.start({ id, question, history, useScreen: usedScreen })
    if (!res.ok) {
      patch(id, t => ({ ...t, streaming: false, error: res.error ?? 'Could not start' }))
      activeId.current = null
    }
  }

  const stop = () => { if (activeId.current) api.investigate.cancel(activeId.current) }

  const toggleScreen = async () => {
    const next = !shareScreen
    setShareScreen(next)
    await api.setSettings({ shareScreen: next })
  }

  const folderName = (p: string) => p.replace(/[\/]+$/, '').split(/[\/]/).pop() ?? p

  // A new folder is a new subject: earlier answers were about the old one, so the chat starts over.
  const changeWorkspace = async () => {
    const picked = await api.textbar.pickWorkspace()
    if (picked) {
      setWorkspace(folderName(picked))
      setTurns([])
    }
    inputRef.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      if (busy) stop()
      else dismiss()
    }
  }

  const screenOn = shareScreen && hasScreen
  const screenLabel = !shareScreen ? 'Screen sharing is off. Turn on to include your screen with each question.'
    : hasScreen ? 'Your screen is included with each question. Turn off.'
    : 'Screen sharing is on and applies the next time you open this bar. Turn off.'

  return (
    <div ref={rootRef} className="ask-root" onKeyDown={onKeyDown}>
      <div className={`ask-shell ${open ? 'is-open' : ''}`}>
        <div className="ask-panel">
          {turns.length === 0 ? (
            <ul className="ask-suggestions" aria-label="Suggestions">
              {SUGGESTIONS.map(s => (
                <li key={s.text}>
                  <button type="button" className="ask-suggestion" onClick={() => send(s.text)}>
                    <SuggestionIcon name={s.icon} />
                    {s.text}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div ref={threadRef} className="ask-thread" aria-live="polite">
              {turns.map(t => (
                <article key={t.id} className="ask-turn">
                  <h2 className="ask-question allow-select">{t.question}</h2>
                  {t.text
                    ? <Markdown text={t.text} />
                    : t.streaming && <p className="ask-status"><span className="pulse-dot" aria-hidden="true" />{t.usedScreen ? 'Looking at your screen and the code…' : 'Looking through the code…'}</p>}
                  {t.error && (
                    <div className="toast-error mt-2" role="alert">
                      {t.error}
                      {/key|settings|workspace/i.test(t.error) && (
                        <button type="button" className="btn !h-7 ml-2 align-middle" onClick={() => api.showMain()}>Open Coworker</button>
                      )}
                    </div>
                  )}
                  {t.saved.map(n => (
                    <p key={n.id} className="ask-saved" role="status">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        {n.ok === false ? <path d="M6 6l12 12M18 6 6 18"/> : <path d="m5 12 5 5 9-10"/>}
                      </svg>
                      <span>{n.ok === false ? 'Could not save note' : n.ok ? 'Saved to Notes' : 'Saving to Notes'}: <strong>{n.title}</strong></span>
                      {n.ok && <button type="button" className="ask-link" onClick={() => api.showMain()}>Open Coworker</button>}
                    </p>
                  ))}
                  {t.cancelled && <p className="ask-status">Stopped.</p>}
                  {!t.error && (
                    <SourceRow sources={t.sources} settled={!t.streaming && !t.cancelled && t.saved.length === 0 && t.text.trim().split(/\s+/).length >= 12} />
                  )}
                </article>
              ))}
            </div>
          )}
          <div className="ask-footer">
            <span><kbd>Enter</kbd> send</span>
            <span><kbd>Shift</kbd><kbd>Enter</kbd> new line</span>
            <span><kbd>Esc</kbd> {busy ? 'stop' : 'close'}</span>
            <span className="flex-1" />
            {turns.length > 0 && !busy && (
              <button type="button" className="ask-link" onClick={() => { setTurns([]); inputRef.current?.focus() }}>New chat</button>
            )}
            <button type="button" className="ask-link" onClick={() => api.showMain()}>Open Coworker</button>
          </div>
        </div>

        {/* The bar stays where the user put it; answers stack up above it. */}
        <form className={`ask-bar ${multiline ? 'is-multiline' : ''}`} onSubmit={e => { e.preventDefault(); send(input) }}>
          <span className="ask-grip" title="Drag to move" aria-hidden="true">
            <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor"><circle cx="2" cy="2" r="1.3"/><circle cx="8" cy="2" r="1.3"/><circle cx="2" cy="8" r="1.3"/><circle cx="8" cy="8" r="1.3"/><circle cx="2" cy="14" r="1.3"/><circle cx="8" cy="14" r="1.3"/></svg>
          </span>
          <button type="button" className="ask-icon-btn" aria-pressed={shareScreen} aria-label={screenLabel} title={screenLabel}
            data-live={screenOn || undefined} onClick={toggleScreen}>
            <ScreenIcon off={!shareScreen} />
          </button>
          <textarea
            ref={inputRef}
            rows={1}
            className="ask-input allow-select"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              // Enter sends; Shift+Enter starts a new line.
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(input) }
            }}
            placeholder={turns.length ? 'Ask a follow-up' : 'Ask Coworker'}
            aria-label="Ask Coworker about your code"
            spellCheck={false}
            autoComplete="off"
          />
          <button type="button" className="ask-context" disabled={busy} onClick={changeWorkspace}
            aria-label={workspace ? `Workspace: ${workspace}. Change folder` : 'Choose a workspace folder'}
            title={workspace ? `Workspace: ${workspace}
Click to change folder` : 'Choose a workspace folder'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
            <span className="ask-context-name">{workspace ?? 'Choose folder'}</span>
            {workspace && <span className="ask-context-mode">{screenOn ? '+ screen' : 'files only'}</span>}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
          </button>
          {busy ? (
            <button type="button" className="ask-send is-stop" aria-label="Stop answering" title="Stop (Esc)" onClick={stop}>
              <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><rect x="1.5" y="1.5" width="9" height="9" rx="2" fill="currentColor"/></svg>
            </button>
          ) : (
            <button type="submit" className="ask-send" aria-label="Send" title="Send (Enter)" disabled={!input.trim()}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>
            </button>
          )}
        </form>
      </div>
    </div>
  )
}

function ScreenIcon({ off }: { off: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>
      {off && <path d="M4 3l16 18"/>}
    </svg>
  )
}

function SuggestionIcon({ name }: { name: 'screen' | 'map' | 'search' }) {
  const common = { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  if (name === 'screen') return <svg {...common}><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>
  if (name === 'map') return <svg {...common}><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"/></svg>
  return <svg {...common}><circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/></svg>
}

ReactDOM.createRoot(document.getElementById('textbar-root')!).render(<TextBar />)
