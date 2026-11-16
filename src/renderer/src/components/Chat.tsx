import { useEffect, useRef } from 'react'
import { Markdown } from './Markdown'

export type ToolCall = {
  id: string
  name: string
  input: any
  status: 'running' | 'done' | 'error'
  resultPreview?: string
  errorMessage?: string
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  createdAt: number
  toolCalls?: ToolCall[]
  streaming?: boolean
  cancelled?: boolean
  imagePreview?: string
}

export function Chat({ messages }: { messages: ChatMessage[] }) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-6 py-6 flex flex-col gap-5">
        {messages.map(m => <Bubble key={m.id} msg={m} />)}
        <div ref={endRef} />
      </div>
    </div>
  )
}

function Bubble({ msg }: { msg: ChatMessage }) {
  if (msg.role === 'user') {
    return (
      <div className="animate-in flex justify-end">
        <div className="max-w-[80%] flex flex-col items-end gap-2">
          {msg.imagePreview && (
            <img src={msg.imagePreview} alt="shared screen"
              className="rounded-lg border border-line max-w-full max-h-56 object-contain bg-black/30"/>
          )}
          <div className="rounded-2xl rounded-br-sm px-4 py-2.5 bg-accent-soft border border-accent/25 text-white/95 text-sm leading-relaxed allow-select">
            {msg.text}
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className="animate-in">
      {msg.toolCalls && msg.toolCalls.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {msg.toolCalls.map(tc => <ToolPill key={tc.id} tc={tc} />)}
        </div>
      )}
      {msg.text ? <Markdown text={msg.text} /> : null}
      {msg.streaming && !msg.text && <span className="pulse-dot text-white/50 text-xs">Investigating…</span>}
      {msg.cancelled && <span className="ml-2 text-xs text-white/40">(cancelled)</span>}
    </div>
  )
}

function ToolPill({ tc }: { tc: ToolCall }) {
  const summary = toolSummary(tc)
  const color =
    tc.status === 'error' ? 'border-red-400/40 bg-red-400/10 text-red-200' :
    tc.status === 'done' ? 'border-line text-white/70' :
    'border-accent/40 bg-accent-soft text-white/90'
  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border ${color}`}>
      {tc.status === 'running' && <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"/>}
      <span className="font-mono text-[11px] opacity-70">{tc.name}</span>
      <span className="truncate max-w-[280px]">{summary}</span>
    </div>
  )
}

function toolSummary(tc: ToolCall) {
  const i = tc.input ?? {}
  if (tc.name === 'read_file') return i.path + (i.start_line ? ` :${i.start_line}-${i.end_line ?? ''}` : '')
  if (tc.name === 'list_dir') return i.path ?? '.'
  if (tc.name === 'grep') return `/${i.pattern}/`
  return JSON.stringify(i).slice(0, 60)
}
