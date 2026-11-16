import { useState, useRef, useEffect } from 'react'
import { voice } from '../voice'

type Source = { id: string; name: string; thumbnailDataUrl: string; isScreen: boolean }

export function Composer({ onSend, onCancel, busy, disabled, voiceEnabled, onVoiceToggle, speaking, onStopSpeaking, sharedSource, onPickScreen, onClearShare }: {
  onSend: (q: string) => void
  onCancel: () => void
  busy: boolean
  disabled: boolean
  voiceEnabled: boolean
  onVoiceToggle: () => void
  speaking: boolean
  onStopSpeaking: () => void
  sharedSource: Source | null
  onPickScreen: () => void
  onClearShare: () => void
}) {
  const [text, setText] = useState('')
  const [listening, setListening] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const baseTextRef = useRef('')

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto'
      ref.current.style.height = Math.min(ref.current.scrollHeight, 180) + 'px'
    }
  }, [text])

  const submit = (override?: string) => {
    const q = (override ?? text).trim()
    if (!q || busy || disabled) return
    onSend(q)
    setText('')
    baseTextRef.current = ''
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
  }

  const toggleMic = () => {
    if (listening) {
      voice.stopListening()
      return
    }
    if (!voice.listenAvailable()) {
      alert('Speech recognition is not available in this build of Electron.')
      return
    }
    baseTextRef.current = text ? text + ' ' : ''
    const started = voice.startListening(
      interim => setText(baseTextRef.current + interim),
      final => {
        setText(baseTextRef.current + final)
        setTimeout(() => submit(baseTextRef.current + final), 60)
      },
      () => setListening(false)
    )
    if (started) setListening(true)
  }

  return (
    <div className="px-6 pb-6 pt-2">
      <div className="max-w-3xl mx-auto">
        <div className="mb-2 flex justify-between items-center gap-2 min-h-[28px]">
          <div className="flex-1 min-w-0">
            {sharedSource && (
              <div className="inline-flex items-center gap-2 pl-1 pr-2 py-1 rounded-full bg-accent-soft border border-accent/30 text-xs text-white/90 max-w-full">
                <img src={sharedSource.thumbnailDataUrl} alt="" className="w-6 h-4 object-cover rounded-sm" />
                <span className="truncate max-w-[260px]">Sharing: {sharedSource.name}</span>
                <button onClick={onClearShare} className="text-white/60 hover:text-white ml-1" aria-label="Stop sharing">
                  <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1.5"/></svg>
                </button>
              </div>
            )}
          </div>
          {speaking && (
            <button className="btn text-xs" onClick={onStopSpeaking}>
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse mr-1"/>
              Speaking… stop
            </button>
          )}
        </div>
        <div className="glass-raised rounded-xl p-2 flex items-end gap-2"
             style={{ boxShadow: '0 10px 30px rgba(0,0,0,0.25)' }}>
          <button
            aria-label={listening ? 'Stop recording' : 'Start recording'}
            onClick={toggleMic}
            disabled={disabled || busy}
            className={`h-9 w-9 shrink-0 rounded-md grid place-items-center border transition-colors
              ${listening
                ? 'bg-red-500/30 border-red-400/50 text-white'
                : 'border-line text-white/70 hover:text-white hover:bg-white/5'}
              disabled:opacity-40 disabled:cursor-not-allowed`}>
            {listening ? (
              <span className="w-2.5 h-2.5 rounded-full bg-red-400 animate-pulse"/>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="2" width="6" height="12" rx="3"/>
                <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3"/>
              </svg>
            )}
          </button>
          <button
            aria-label="Share a window or screen"
            onClick={onPickScreen}
            disabled={disabled}
            className={`h-9 w-9 shrink-0 rounded-md grid place-items-center border transition-colors
              ${sharedSource
                ? 'bg-accent/15 border-accent/40 text-accent'
                : 'border-line text-white/70 hover:text-white hover:bg-white/5'}
              disabled:opacity-40 disabled:cursor-not-allowed`}
            title={sharedSource ? `Sharing: ${sharedSource.name}` : 'Share a window or screen'}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>
            </svg>
          </button>
          <button
            aria-label={voiceEnabled ? 'Mute replies' : 'Enable spoken replies'}
            onClick={onVoiceToggle}
            className={`h-9 w-9 shrink-0 rounded-md grid place-items-center border transition-colors
              ${voiceEnabled
                ? 'bg-accent/15 border-accent/40 text-accent'
                : 'border-line text-white/50 hover:text-white hover:bg-white/5'}`}
            title={voiceEnabled ? 'Spoken replies on' : 'Spoken replies off'}>
            {voiceEnabled ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6"/>
              </svg>
            )}
          </button>
          <textarea
            ref={ref}
            rows={1}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={disabled}
            placeholder={disabled ? 'Finish setup first…' : listening ? 'Listening…' : 'Ask about the codebase…'}
            className="flex-1 bg-transparent resize-none outline-none text-sm text-white placeholder:text-white/40 py-1.5 px-2 allow-select max-h-[180px]"
          />
          {busy ? (
            <button className="btn" onClick={onCancel}>
              <svg width="12" height="12" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" fill="currentColor"/></svg>
              Stop
            </button>
          ) : (
            <button className="btn-primary" onClick={() => submit()} disabled={disabled || !text.trim()}>
              Send
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </button>
          )}
        </div>
        <div className="text-[11px] text-white/40 mt-2 px-1">
          Enter to send · Shift+Enter for newline · Click the mic to talk{voice.listenAvailable() ? '' : ' (unavailable in this Electron build)'}
        </div>
      </div>
    </div>
  )
}
