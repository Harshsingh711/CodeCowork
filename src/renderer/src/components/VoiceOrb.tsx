import { useEffect, useRef, type RefObject } from 'react'
import type { VoiceStatus } from '../useVoice'

type Analysers = { mic: RefObject<AnalyserNode | null>; out: RefObject<AnalyserNode | null> }

const LABELS: Record<VoiceStatus, string> = {
  idle: 'Ready',
  connecting: 'Connecting…',
  listening: 'Listening',
  user_speaking: 'Hearing you',
  thinking: 'Thinking',
  speaking: 'Speaking',
  error: 'Error'
}

/**
 * The voice orb: a 3D sphere of points drawn on a canvas. Its surface ripples with the live
 * spectrum (your mic while you talk, Coworker's voice while it answers) and a tilted ring
 * around it plays the same spectrum as a circular waveform.
 * Colour per status comes from the theme (--orb-rgb in index.css), not from this file.
 */
export function VoiceOrb({ status, level, analysers }: { status: VoiceStatus; level: number; analysers?: Analysers }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Latest props for the animation loop, which runs outside React's render cycle.
  const live = useRef({ level, analysers })
  live.current = { level, analysers }

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!host || !canvas || !ctx) return
    return runOrb(host, canvas, ctx, () => live.current)
  }, [])

  return (
    <div className="flex flex-col items-center gap-6">
      <div ref={hostRef} className="orb" data-status={status} aria-hidden="true">
        <div className="orb-glow" />
        <canvas ref={canvasRef} className="orb-canvas" />
      </div>
      <div className="orb-label" data-status={status} role="status" aria-live="polite">{LABELS[status] ?? ''}</div>
    </div>
  )
}

// ── Renderer ──────────────────────────────────────────────────────────────

const POINTS = 1100
const BANDS = 28
const RING_STEPS = 144
const CANVAS_SCALE = 2 // the canvas is larger than the orb box so ripples and the ring have room
const CAMERA = 3.4 // camera distance, in sphere radii
const RING_RADIUS = 1.5
const RING_CAMERA = 7 // the ring gets a flatter perspective than the sphere so it stays centred

type Point = { x: number; y: number; z: number; band: number; phase: number }

/** Even spread of points on a sphere (Fibonacci lattice). */
function buildSphere(): Point[] {
  const pts: Point[] = []
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < POINTS; i++) {
    const y = 1 - (i / (POINTS - 1)) * 2
    const r = Math.sqrt(1 - y * y)
    const theta = golden * i
    pts.push({
      x: Math.cos(theta) * r,
      y,
      z: Math.sin(theta) * r,
      // Low frequencies drive the equator, highs the poles: speech makes the middle swell.
      band: Math.min(BANDS - 1, Math.floor(Math.abs(y) * BANDS)),
      phase: theta
    })
  }
  return pts
}

function runOrb(
  host: HTMLDivElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  getLive: () => { level: number; analysers?: Analysers }
): () => void {
  const points = buildSphere()
  const bands = new Float32Array(BANDS) // smoothed 0..1 per band
  let freq = new Uint8Array(256)
  const color = [150, 153, 178]
  let target = [150, 153, 178]
  let seenStatus = ''
  let energy = 0
  let spin = 0
  let intensity = 0.4
  let size = 0
  let dpr = 1
  let raf = 0
  let last = performance.now()
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    size = host.clientWidth * CANVAS_SCALE
    canvas.width = Math.round(size * dpr)
    canvas.height = Math.round(size * dpr)
  }
  const ro = new ResizeObserver(resize)
  ro.observe(host)
  resize()

  /** Fill `bands` from an analyser's speech range (roughly 80 Hz to 5 kHz). Returns false if silent or absent. */
  const readBands = (an: AnalyserNode | null | undefined, gain: number): boolean => {
    if (!an) return false
    if (freq.length !== an.frequencyBinCount) freq = new Uint8Array(an.frequencyBinCount)
    an.getByteFrequencyData(freq)
    const hzPerBin = an.context.sampleRate / an.fftSize
    const lo = Math.max(1, Math.round(80 / hzPerBin))
    const hi = Math.min(freq.length, Math.round(5000 / hzPerBin))
    const span = (hi - lo) / BANDS
    for (let b = 0; b < BANDS; b++) {
      const from = Math.floor(lo + b * span)
      const to = Math.max(from + 1, Math.floor(lo + (b + 1) * span))
      let sum = 0
      for (let i = from; i < to; i++) sum += freq[i]
      const v = Math.min(1, (sum / (to - from) / 255) * gain * (1 + b / BANDS)) // lift the quieter highs
      bands[b] += (v - bands[b]) * (v > bands[b] ? 0.55 : 0.14) // fast attack, slow release
    }
    return true
  }

  /** Bands with no audio behind them: a travelling wave, scaled by `amount`. */
  const synthBands = (t: number, amount: number, speed: number) => {
    for (let b = 0; b < BANDS; b++) {
      const v = amount * (0.5 + 0.5 * Math.sin(t * speed - b * 0.55)) * (0.6 + 0.4 * Math.sin(t * speed * 0.37 + b))
      bands[b] += (v - bands[b]) * 0.12
    }
  }

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame)
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    const t = now / 1000
    const status = (host.dataset.status ?? 'idle') as VoiceStatus
    const { level, analysers } = getLive()

    // Theme colour for this status, read from CSS so the canvas follows the tokens.
    if (status !== seenStatus) {
      seenStatus = status
      const raw = getComputedStyle(host).getPropertyValue('--orb-rgb').trim().split(/[\s,]+/).map(Number)
      if (raw.length >= 3 && raw.every(n => Number.isFinite(n))) target = raw.slice(0, 3)
    }
    for (let i = 0; i < 3; i++) color[i] += (target[i] - color[i]) * Math.min(1, dt * 5)

    // What moves the surface in each state.
    let spinSpeed = 0.16
    let targetIntensity = 0.45
    if (status === 'user_speaking') {
      if (!readBands(analysers?.mic.current, 2.6)) synthBands(t, 0.35 + level * 0.6, 7)
      spinSpeed = 0.3; targetIntensity = 1
    } else if (status === 'speaking') {
      if (!readBands(analysers?.out.current, 2.2)) synthBands(t, 0.6, 6)
      spinSpeed = 0.34; targetIntensity = 1
    } else if (status === 'listening') {
      if (!readBands(analysers?.mic.current, 1.2)) synthBands(t, 0.08, 1.4)
      spinSpeed = 0.2; targetIntensity = 0.75
    } else if (status === 'thinking') {
      synthBands(t, 0.34, 3.2)
      spinSpeed = 0.95; targetIntensity = 0.85
    } else if (status === 'connecting') {
      synthBands(t, 0.2 + 0.2 * Math.sin(t * 4), 2.4)
      spinSpeed = 0.5; targetIntensity = 0.65
    } else if (status === 'error') {
      synthBands(t, 0, 1)
      spinSpeed = 0.04; targetIntensity = 0.5
    } else {
      synthBands(t, 0.07, 0.9) // idle: slow breathing
    }
    if (reduceMotion.matches) spinSpeed = 0
    spin += spinSpeed * dt
    intensity += (targetIntensity - intensity) * Math.min(1, dt * 4)

    let sum = 0
    for (let b = 0; b < BANDS; b++) sum += bands[b]
    energy += (sum / BANDS - energy) * 0.25

    // ── Draw ──
    const w = canvas.width
    const cx = w / 2
    const R = (host.clientWidth * dpr * 0.43) * (1 + energy * 0.08)
    const [cr, cg, cb] = color.map(Math.round)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, w, w)
    ctx.globalCompositeOperation = 'lighter'

    // Core glow: brighter with energy.
    const core = ctx.createRadialGradient(cx, cx, 0, cx, cx, R * 1.15)
    core.addColorStop(0, `rgba(${cr},${cg},${cb},${0.1 + energy * 0.5 * intensity})`)
    core.addColorStop(0.55, `rgba(${cr},${cg},${cb},${0.04 + energy * 0.12})`)
    core.addColorStop(1, `rgba(${cr},${cg},${cb},0)`)
    ctx.fillStyle = core
    ctx.beginPath(); ctx.arc(cx, cx, R * 1.15, 0, Math.PI * 2); ctx.fill()

    const sinY = Math.sin(spin), cosY = Math.cos(spin)
    const tilt = 0.38 + Math.sin(t * 0.21) * (reduceMotion.matches ? 0 : 0.06)
    const sinX = Math.sin(tilt), cosX = Math.cos(tilt)

    // Sphere points. Alpha is bucketed so the fill style changes a handful of times, not per point.
    const LEVELS = 6
    const buckets: number[][] = Array.from({ length: LEVELS }, () => [])
    for (const p of points) {
      const ripple = bands[p.band] * (0.62 + 0.38 * Math.sin(p.phase * 3 + t * 2.2))
      const r = 1 + ripple * 0.34 * intensity
      const x0 = p.x * r, y0 = p.y * r, z0 = p.z * r
      const x1 = x0 * cosY + z0 * sinY
      const z1 = -x0 * sinY + z0 * cosY
      const y2 = y0 * cosX - z1 * sinX
      const z2 = y0 * sinX + z1 * cosX
      const k = CAMERA / (CAMERA - z2)
      const depth = (z2 + 1.35) / 2.7 // 0 back … 1 front
      const lvl = Math.max(0, Math.min(LEVELS - 1, Math.floor(depth * LEVELS)))
      buckets[lvl].push(cx + x1 * R * k, cx + y2 * R * k, (0.55 + depth * 1.25 + ripple * 1.1) * dpr * k)
    }
    for (let l = 0; l < LEVELS; l++) {
      const d = (l + 0.5) / LEVELS
      const a = (0.1 + d * d * 0.85) * (0.55 + intensity * 0.45)
      // Front points lean toward white, like light catching glass.
      const wmix = d * d * 0.45
      ctx.fillStyle = `rgba(${Math.round(cr + (255 - cr) * wmix)},${Math.round(cg + (255 - cg) * wmix)},${Math.round(cb + (255 - cb) * wmix)},${a})`
      const arr = buckets[l]
      ctx.beginPath()
      for (let i = 0; i < arr.length; i += 3) {
        ctx.moveTo(arr[i] + arr[i + 2], arr[i + 1])
        ctx.arc(arr[i], arr[i + 1], arr[i + 2], 0, Math.PI * 2)
      }
      ctx.fill()
    }

    // Spectrum ring: a circular waveform on a tilted plane, counter-rotating.
    const ringSpin = -spin * 0.6
    const sinR = Math.sin(ringSpin), cosR = Math.cos(ringSpin)
    const ringTilt = 0.46 // seen at a shallow angle, so it reads as an orbit, not a circle
    const roll = -0.32
    const sinZ = Math.sin(roll), cosZ = Math.cos(roll)
    const sinT = Math.sin(ringTilt), cosT = Math.cos(ringTilt)
    // The near half of a tilted ring is magnified and the far half shrunk, which pushes the
    // ring's centre off the sphere. A gentler camera plus this offset keeps it centred.
    const zEdge = RING_RADIUS * cosT
    const yOffset = -RING_RADIUS * sinT * (RING_CAMERA / (RING_CAMERA - zEdge) - RING_CAMERA / (RING_CAMERA + zEdge)) / 2
    ctx.lineWidth = 1.1 * dpr
    ctx.lineCap = 'round'
    let px = 0, py = 0, pz = 0
    for (let i = 0; i <= RING_STEPS; i++) {
      const u = i / RING_STEPS
      // Mirror the spectrum so the loop closes smoothly.
      const bi = (u < 0.5 ? u * 2 : (1 - u) * 2) * (BANDS - 1)
      const b0 = Math.floor(bi), f = bi - b0
      const amp = bands[b0] * (1 - f) + bands[Math.min(BANDS - 1, b0 + 1)] * f
      const rr = RING_RADIUS + amp * 0.34 * intensity
      const ang = u * Math.PI * 2
      const x0 = Math.cos(ang) * rr, z0 = Math.sin(ang) * rr
      const x1 = x0 * cosR + z0 * sinR
      const z1 = -x0 * sinR + z0 * cosR
      const y2 = -z1 * sinT
      const z2 = z1 * cosT
      const k = RING_CAMERA / (RING_CAMERA - z2)
      const fx = x1 * k, fy = y2 * k - yOffset
      const sx = cx + (fx * cosZ - fy * sinZ) * R, sy = cx + (fx * sinZ + fy * cosZ) * R
      if (i > 0) {
        const depth = ((z2 + pz) / 2 + 1.7) / 3.4
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${(0.12 + depth * 0.6) * (0.5 + intensity * 0.5)})`
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(sx, sy); ctx.stroke()
      }
      px = sx; py = sy; pz = z2
    }
    ctx.globalCompositeOperation = 'source-over'
  }

  raf = requestAnimationFrame(frame)
  return () => { cancelAnimationFrame(raf); ro.disconnect() }
}
