import type { VoiceStatus } from '../useVoice'

export function VoiceOrb({ status, level }: { status: VoiceStatus; level: number }) {
  const active = status === 'user_speaking' || status === 'speaking' || status === 'listening' || status === 'thinking'
  const pulse =
    status === 'user_speaking' ? 1 + Math.min(level * 1.4, 0.6) :
    status === 'speaking' ? 1.08 :
    status === 'thinking' ? 1.04 :
    status === 'listening' ? 1 :
    1
  const glow =
    status === 'user_speaking' ? 'rgba(139, 124, 255, 0.9)' :
    status === 'speaking' ? 'rgba(139, 124, 255, 0.75)' :
    status === 'thinking' ? 'rgba(139, 124, 255, 0.45)' :
    status === 'listening' ? 'rgba(139, 124, 255, 0.35)' :
    'rgba(255,255,255,0.12)'
  const label =
    status === 'idle' ? 'Start voice session' :
    status === 'connecting' ? 'Connecting…' :
    status === 'listening' ? 'Listening' :
    status === 'user_speaking' ? 'Hearing you' :
    status === 'thinking' ? 'Thinking' :
    status === 'speaking' ? 'Speaking' :
    status === 'error' ? 'Error' : ''
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative" style={{ width: 240, height: 240 }}>
        <div className="absolute inset-0 rounded-full transition-all duration-200"
             style={{
               background: `radial-gradient(circle at 30% 25%, rgba(255,255,255,0.14), transparent 55%), radial-gradient(circle at 70% 75%, ${glow}, transparent 65%), linear-gradient(145deg, rgba(139,124,255,0.35), rgba(80,120,255,0.2))`,
               transform: `scale(${pulse})`,
               boxShadow: `0 0 ${active ? 80 : 20}px ${glow}, inset 0 0 80px rgba(255,255,255,0.06)`,
               border: '1px solid rgba(255,255,255,0.12)'
             }} />
        {active && (
          <div className="absolute inset-0 rounded-full animate-ping-slow opacity-30"
               style={{ background: `radial-gradient(circle, ${glow}, transparent 65%)` }} />
        )}
      </div>
      <div className="text-sm uppercase tracking-[0.2em] text-white/70">{label}</div>
    </div>
  )
}
