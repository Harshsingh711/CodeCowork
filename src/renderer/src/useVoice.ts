import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import type { Note, SourceLookup, TranscriptEntry } from '../../shared/types'

export type VoiceStatus = 'idle' | 'connecting' | 'listening' | 'user_speaking' | 'thinking' | 'speaking' | 'error'

export type RawEvent = {
  id: string
  direction: 'in' | 'out'
  type: string
  ts: number
  payload: unknown
}

const RAW_LIMIT = 300

type CallResult = { callId: string; output: string; image?: string }

export function useVoice() {
  const [status, setStatus] = useState<VoiceStatus>('idle')
  const [micLevel, setMicLevel] = useState(0)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [toolBanner, setToolBanner] = useState<{ name: string; summary: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rawEvents, setRawEvents] = useState<RawEvent[]>([])

  const pushRaw = (direction: 'in' | 'out', obj: any) => {
    const type = (obj && typeof obj === 'object' && typeof obj.type === 'string') ? obj.type : '(unknown)'
    const entry: RawEvent = {
      id: Math.random().toString(36).slice(2),
      direction,
      type,
      ts: Date.now(),
      payload: obj
    }
    setRawEvents(prev => {
      const next = [...prev, entry]
      return next.length > RAW_LIMIT ? next.slice(next.length - RAW_LIMIT) : next
    })
    api.live.log({ direction, ts: entry.ts, payload: obj })
  }

  const clearRaw = () => setRawEvents([])

  // Notes are saved by the main process (from voice and from the text bar); mirror that list here.
  useEffect(() => {
    api.notes.list().then(setNotes)
    return api.notes.onChanged(setNotes)
  }, [])

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const audioElRef = useRef<HTMLAudioElement | null>(null)
  const dataChannelRef = useRef<RTCDataChannel | null>(null)
  const vuRafRef = useRef<number | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  // Spectrum of Coworker's own voice, for the visualizer. Never routed to the speakers (the <audio> element plays it).
  const outAnalyserRef = useRef<AnalyserNode | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)

  // The Live API streams transcript deltas with no item ids and no "done" events,
  // so a turn is "everything one speaker says until the other one speaks".
  const cur = useRef<{ id: string; role: 'user' | 'assistant'; text: string } | null>(null)
  const settleTimer = useRef<number | null>(null)
  // Tool calls of the backend response in flight; all must be answered before it can continue.
  const pendingCalls = useRef<Promise<CallResult>[]>([])
  const backendBusy = useRef(0)

  const newId = (prefix: string) => prefix + '-' + Math.random().toString(36).slice(2)

  const closeCurrent = () => {
    const c = cur.current
    if (!c) return
    cur.current = null
    setTranscript(prev => prev.map(e => e.id === c.id ? { ...e, partial: false } : e))
  }

  const openEntry = (role: 'user' | 'assistant') => {
    closeCurrent()
    const c = { id: newId(role), role, text: '' }
    cur.current = c
    setTranscript(prev => [...prev, {
      id: c.id, role, text: '', partial: true, createdAt: Date.now(),
      ...(role === 'assistant' ? { sources: [] } : {})
    }])
    return c
  }

  const appendSpeech = (role: 'user' | 'assistant', delta: string) => {
    const c = cur.current && cur.current.role === role ? cur.current : openEntry(role)
    c.text += delta
    const id = c.id
    const text = c.text.trimStart()
    setTranscript(prev => prev.map(e => e.id === id ? { ...e, text, partial: true } : e))
    setStatus(role === 'user' ? 'user_speaking' : 'speaking')
    // No "done" event exists: a pause in the deltas is what ends the live state.
    if (settleTimer.current) window.clearTimeout(settleTimer.current)
    settleTimer.current = window.setTimeout(() => {
      setTranscript(prev => prev.map(e => e.id === id ? { ...e, partial: false } : e))
      setStatus(prev => prev === 'error' || prev === 'idle' ? prev
        : backendBusy.current > 0 || role === 'user' ? 'thinking' : 'listening')
    }, 1400)
  }

  /** The assistant entry that lookups made right now belong to (opens one if the user spoke last). */
  const ensureTurnEntry = (): string =>
    (cur.current && cur.current.role === 'assistant' ? cur.current : openEntry('assistant')).id

  const addSource = (entryId: string, src: SourceLookup) => {
    setTranscript(prev => prev.map(e => e.id === entryId ? { ...e, sources: [...(e.sources ?? []), src] } : e))
  }

  const patchSource = (sourceId: string, patch: Partial<SourceLookup>) => {
    setTranscript(prev => prev.map(e =>
      e.sources?.some(s => s.id === sourceId)
        ? { ...e, sources: e.sources.map(s => s.id === sourceId ? { ...s, ...patch } : s) }
        : e))
  }

  const start = async () => {
    setError(null)
    setStatus('connecting')
    api.live.resetLog()
    try {
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false
      })
      micStreamRef.current = mic

      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
      pcRef.current = pc

      pc.ontrack = (ev) => {
        if (!audioElRef.current) {
          const el = new Audio()
          el.autoplay = true
          audioElRef.current = el
        }
        audioElRef.current.srcObject = ev.streams[0]
        try {
          const ctx = audioCtxRef.current
          if (ctx && ev.streams[0]) {
            const an = ctx.createAnalyser()
            an.fftSize = 512
            an.smoothingTimeConstant = 0.75
            ctx.createMediaStreamSource(ev.streams[0]).connect(an)
            outAnalyserRef.current = an
          }
        } catch { /* the visualizer falls back to a synthetic pulse */ }
      }

      const dc = pc.createDataChannel('oai-events')
      dataChannelRef.current = dc
      dc.onmessage = (ev) => handleEvent(ev.data)
      dc.onopen = () => setStatus('listening')
      dc.onclose = () => setStatus(prev => prev === 'error' ? prev : 'idle')

      mic.getAudioTracks().forEach(t => pc.addTrack(t, mic))
      pc.addTransceiver('audio', { direction: 'recvonly' })

      startVuMeter(mic)

      const offer = await pc.createOffer({ offerToReceiveAudio: true })
      await pc.setLocalDescription(offer)
      await waitForIceGathering(pc)

      const res = await api.live.createSession(pc.localDescription!.sdp!)
      if (!res.ok || !res.answerSdp) throw new Error(res.error ?? 'Session creation failed')
      await pc.setRemoteDescription({ type: 'answer', sdp: res.answerSdp })
    } catch (e: any) {
      setError(e?.message ?? String(e))
      setStatus('error')
      await stop()
    }
  }

  const stop = async () => {
    try { dataChannelRef.current?.close() } catch { /* ignore */ }
    try { pcRef.current?.close() } catch { /* ignore */ }
    micStreamRef.current?.getTracks().forEach(t => t.stop())
    if (vuRafRef.current) cancelAnimationFrame(vuRafRef.current)
    try { await audioCtxRef.current?.close() } catch { /* ignore */ }
    pcRef.current = null
    micStreamRef.current = null
    dataChannelRef.current = null
    analyserRef.current = null
    outAnalyserRef.current = null
    audioCtxRef.current = null
    vuRafRef.current = null
    setMicLevel(0)
    if (settleTimer.current) window.clearTimeout(settleTimer.current)
    closeCurrent()
    pendingCalls.current = []
    backendBusy.current = 0
    setToolBanner(null)
    setStatus(prev => prev === 'error' ? prev : 'idle')
  }

  const interrupt = () => {
    sendEvent({ type: 'response.cancel' })
    sendEvent({ type: 'conversation.item.truncate' })
  }

  const startVuMeter = (stream: MediaStream) => {
    const ctx = new AudioContext()
    audioCtxRef.current = ctx
    const src = ctx.createMediaStreamSource(stream)
    const an = ctx.createAnalyser()
    an.fftSize = 512
    src.connect(an)
    analyserRef.current = an
    const buf = new Uint8Array(an.fftSize)
    const tick = () => {
      an.getByteTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128
        sum += v * v
      }
      const rms = Math.sqrt(sum / buf.length)
      setMicLevel(Math.min(1, rms * 2.2))
      vuRafRef.current = requestAnimationFrame(tick)
    }
    tick()
  }

  const sendEvent = (obj: any) => {
    const dc = dataChannelRef.current
    if (dc && dc.readyState === 'open') {
      dc.send(JSON.stringify(obj))
      // Keep screenshots out of the Raw tab and the on-disk log.
      pushRaw('out', JSON.parse(JSON.stringify(obj, (k, v) => k === 'image_url' && typeof v === 'string' ? v.slice(0, 40) + '… (' + v.length + ' chars)' : v)))
    }
  }

  /** Largest JSON message the data channel will carry, in bytes. */
  const maxMessageBytes = (): number => {
    const n = pcRef.current?.sctp?.maxMessageSize
    return Math.min(n && Number.isFinite(n) && n > 0 ? n : 65536, 262144)
  }

  /** Run one backend function call. Always resolves: an unanswered call blocks the whole session. */
  const runCall = async (item: any): Promise<CallResult> => {
    const name: string = item.name
    const callId: string = item.call_id
    let args: any = {}
    try { args = typeof item.arguments === 'string' ? JSON.parse(item.arguments || '{}') : (item.arguments ?? {}) } catch { /* ignore */ }
    setToolBanner({ name, summary: shortArg(name, args) })
    try {
      if (name === 'look_at_screen') {
        // Leave room for the JSON envelope around the base64 image.
        const shot = await api.live.captureScreen(maxMessageBytes() - 1024)
        if (!shot.ok || !shot.dataUrl) return { callId, output: `ERROR: could not capture the screen: ${shot.error ?? 'unknown error'}` }
        return {
          callId,
          output: `Captured the user's screen (${shot.width}x${shot.height}). The screenshot is attached as the next image.`,
          image: shot.dataUrl
        }
      }

      const kind = LOOKUP_KIND[name]
      const sourceId = kind ? newId('src') : null
      if (kind && sourceId) {
        addSource(ensureTurnEntry(), {
          id: sourceId, kind, status: 'running',
          path: kind === 'search' ? undefined : String(args?.path ?? '.'),
          startLine: args?.start_line, endLine: args?.end_line,
          pattern: kind === 'search' ? String(args?.pattern ?? '') : undefined
        })
      }
      const r = await api.live.runTool(name, args)
      if (sourceId) {
        if (r.ok) patchSource(sourceId, { status: 'done', ...(r.source ?? {}) })
        else patchSource(sourceId, { status: 'error', error: r.error ?? 'Lookup failed' })
      }
      return { callId, output: r.output ?? `ERROR: ${r.error ?? 'tool failed'}` }
    } catch (e: any) {
      return { callId, output: `ERROR: ${e?.message ?? String(e)}` }
    } finally {
      setToolBanner(null)
    }
  }

  /** Answer every pending call, attach any screenshots, then tell the backend to continue. */
  const submitCallResults = (results: CallResult[]) => {
    const limit = maxMessageBytes() - 512
    for (const r of results) {
      let output = r.output
      // Keep oversized tool output under the channel limit (UTF-8 can be up to 3 bytes per char).
      if (output.length * 3 > limit && new TextEncoder().encode(output).length > limit) {
        output = output.slice(0, Math.floor(limit / 3)) + '\n… (truncated)'
      }
      sendEvent({ type: 'response.item.create', item: { type: 'function_call_output', call_id: r.callId, output } })
    }
    for (const r of results) {
      if (!r.image) continue
      sendEvent({
        type: 'response.item.create',
        item: { type: 'message', role: 'user', content: [{ type: 'input_image', image_url: r.image, detail: 'high' }] }
      })
    }
    sendEvent({ type: 'response.create' })
  }

  const handleEvent = async (raw: string) => {
    let msg: any
    try { msg = JSON.parse(raw) } catch {
      pushRaw('in', { type: '(unparseable)', raw: String(raw).slice(0, 200) })
      return
    }
    pushRaw('in', msg)

    const t = msg.type as string

    // Session lifecycle
    if (t === 'session.started' || t === 'session.created' || t === 'session.updated') {
      setStatus(prev => prev === 'connecting' ? 'listening' : prev)
      return
    }
    if (t === 'session.ended' || t === 'session.closed') {
      setStatus('idle')
      return
    }

    // Live transcripts
    if (t === 'session.input_transcript.delta') { appendSpeech('user', msg.delta ?? msg.text ?? ''); return }
    if (t === 'session.output_transcript.delta') { appendSpeech('assistant', msg.delta ?? msg.text ?? ''); return }

    // The voice model handed work to the backend model.
    if (t === 'session.delegation.created') {
      setStatus(prev => prev === 'speaking' || prev === 'user_speaking' ? prev : 'thinking')
      return
    }

    // Backend (Responses) events arrive wrapped in a `response.event` envelope.
    if (t === 'response.event' && msg.event) {
      const ev = msg.event
      const et = ev.type as string
      if (et === 'response.created') { backendBusy.current++; return }
      if (et === 'response.output_item.done' && ev.item?.type === 'function_call') {
        pendingCalls.current.push(runCall(ev.item))
        return
      }
      if (et === 'response.completed' || et === 'response.incomplete' || et === 'response.failed') {
        backendBusy.current = Math.max(0, backendBusy.current - 1)
        const calls = pendingCalls.current
        pendingCalls.current = []
        if (calls.length > 0) {
          submitCallResults(await Promise.all(calls))
        } else if (et === 'response.failed') {
          setError(ev.response?.error?.message ?? 'The backend model failed to answer.')
        }
        return
      }
      if (et === 'error') {
        setError(ev.error?.message ?? ev.message ?? JSON.stringify(ev).slice(0, 300))
      }
      return
    }

    if (t === 'error' || t.endsWith('.error')) {
      setError(msg.error?.message ?? msg.message ?? JSON.stringify(msg).slice(0, 300))
      setStatus('error')
      return
    }
  }

  useEffect(() => () => { stop() }, [])

  // Stable refs, read by the visualizer every frame without re-rendering React.
  const analysers = { mic: analyserRef, out: outAnalyserRef }

  return { status, micLevel, analysers, transcript, notes, toolBanner, error, rawEvents, clearRaw, start, stop, interrupt }
}

const LOOKUP_KIND: Record<string, SourceLookup['kind'] | undefined> = {
  read_file: 'read',
  grep: 'search',
  list_dir: 'list'
}

function shortArg(name: string, args: any) {
  if (name === 'read_file') return args.path ?? ''
  if (name === 'list_dir') return args.path ?? '.'
  if (name === 'grep') return `/${args.pattern}/`
  if (name === 'write_note') return args.title ?? 'note'
  if (name === 'look_at_screen') return 'your screen'
  return ''
}

function waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise(resolve => {
    const t = setTimeout(() => resolve(), 1200)
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') { clearTimeout(t); resolve() }
    })
  })
}
