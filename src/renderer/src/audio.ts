const SAMPLE_RATE = 24000

const WORKLET_SRC = `
class PCMCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this._buf = []
    this._samples = 0
    this._chunk = 2400 // 100ms @ 24kHz
  }
  process(inputs) {
    const input = inputs[0]
    if (!input || input.length === 0) return true
    const ch = input[0]
    if (!ch) return true
    this._buf.push(new Float32Array(ch))
    this._samples += ch.length
    while (this._samples >= this._chunk) {
      const out = new Int16Array(this._chunk)
      let i = 0, need = this._chunk
      while (need > 0 && this._buf.length) {
        const head = this._buf[0]
        const take = Math.min(need, head.length)
        for (let j = 0; j < take; j++) {
          const s = Math.max(-1, Math.min(1, head[j]))
          out[i++] = s < 0 ? s * 0x8000 : s * 0x7fff
        }
        if (take === head.length) this._buf.shift()
        else this._buf[0] = head.subarray(take)
        need -= take
      }
      this._samples -= this._chunk
      let peak = 0
      for (let k = 0; k < out.length; k++) {
        const a = Math.abs(out[k])
        if (a > peak) peak = a
      }
      this.port.postMessage({ pcm: out.buffer, level: peak / 32768 }, [out.buffer])
    }
    return true
  }
}
registerProcessor('pcm-capture', PCMCaptureProcessor)
`

export class AudioIO {
  private ctx: AudioContext | null = null
  private mic: MediaStreamAudioSourceNode | null = null
  private workletNode: AudioWorkletNode | null = null
  private stream: MediaStream | null = null
  private playbackCursor = 0
  private onLevel?: (level: number) => void
  private onPcm?: (base64: string) => void

  async startCapture(opts: { onPcm: (base64: string) => void; onLevel?: (level: number) => void }) {
    this.onPcm = opts.onPcm
    this.onLevel = opts.onLevel
    this.ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
    const blob = new Blob([WORKLET_SRC], { type: 'application/javascript' })
    const url = URL.createObjectURL(blob)
    await this.ctx.audioWorklet.addModule(url)
    URL.revokeObjectURL(url)
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false
    })
    this.mic = this.ctx.createMediaStreamSource(this.stream)
    this.workletNode = new AudioWorkletNode(this.ctx, 'pcm-capture', { numberOfInputs: 1, numberOfOutputs: 0 })
    this.workletNode.port.onmessage = (ev) => {
      const { pcm, level } = ev.data as { pcm: ArrayBuffer; level: number }
      this.onLevel?.(level)
      this.onPcm?.(arrayBufferToBase64(pcm))
    }
    this.mic.connect(this.workletNode)
    this.playbackCursor = this.ctx.currentTime
  }

  enqueuePcm16(base64: string) {
    if (!this.ctx) return
    const bytes = base64ToUint8(base64)
    const samples = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2)
    const buf = this.ctx.createBuffer(1, samples.length, SAMPLE_RATE)
    const ch = buf.getChannelData(0)
    for (let i = 0; i < samples.length; i++) ch[i] = samples[i] / 32768
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    src.connect(this.ctx.destination)
    const now = this.ctx.currentTime
    const start = Math.max(now, this.playbackCursor)
    src.start(start)
    this.playbackCursor = start + buf.duration
  }

  clearPlayback() {
    if (this.ctx) this.playbackCursor = this.ctx.currentTime
  }

  async stop() {
    try { this.workletNode?.disconnect() } catch { /* ignore */ }
    try { this.mic?.disconnect() } catch { /* ignore */ }
    this.stream?.getTracks().forEach(t => t.stop())
    try { await this.ctx?.close() } catch { /* ignore */ }
    this.ctx = null; this.mic = null; this.workletNode = null; this.stream = null
  }
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[])
  }
  return btoa(s)
}
function base64ToUint8(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}
