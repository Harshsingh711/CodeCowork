import { useEffect, useState } from 'react'
import { api } from '../api'

type Source = { id: string; name: string; thumbnailDataUrl: string; isScreen: boolean }

export function SourcePicker({ onPick, onClose }: { onPick: (s: Source) => void; onClose: () => void }) {
  const [sources, setSources] = useState<Source[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.capture.listSources()
      .then(setSources)
      .catch(e => setError(e?.message ?? String(e)))
  }, [])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-6 animate-in"
         style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
         onClick={onClose}>
      <div className="glass-raised rounded-xl p-5 max-w-4xl w-full max-h-[80vh] overflow-auto"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-base font-semibold">Share a window or screen</div>
            <div className="text-xs text-white/55 mt-0.5">The coworker will see this one frame. Pick what you're looking at.</div>
          </div>
          <button className="btn" onClick={onClose}>Cancel</button>
        </div>

        {error && <div className="text-sm text-red-300">Error listing sources: {error}</div>}
        {!sources && !error && <div className="text-sm text-white/55">Loading sources…</div>}

        {sources && (
          <>
            <Group title="Screens" items={sources.filter(s => s.isScreen)} onPick={onPick} />
            <Group title="Windows" items={sources.filter(s => !s.isScreen)} onPick={onPick} />
          </>
        )}
      </div>
    </div>
  )
}

function Group({ title, items, onPick }: { title: string; items: Source[]; onPick: (s: Source) => void }) {
  if (items.length === 0) return null
  return (
    <div className="mb-4">
      <div className="text-xs uppercase tracking-wider text-white/50 mb-2">{title}</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {items.map(s => (
          <button key={s.id} onClick={() => onPick(s)}
            className="group text-left bg-white/5 border border-line rounded-lg overflow-hidden hover:border-accent/40 hover:bg-white/10 transition-colors">
            <div className="aspect-video bg-black/40 overflow-hidden">
              <img src={s.thumbnailDataUrl} alt={s.name} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"/>
            </div>
            <div className="px-2.5 py-2 text-xs text-white/85 truncate">{s.name}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
