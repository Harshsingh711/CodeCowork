import { useEffect, useMemo, useRef, useState } from 'react'
import type { SourceLookup } from '../../../shared/types'
import { api } from '../api'

const VISIBLE_FILES = 4

type Range = { start: number; end: number }

type FileGroup = {
  path: string
  label: string
  ranges: Range[]
  whole: boolean
  status: 'running' | 'done' | 'error'
  error?: string
}

/**
 * The evidence under one Coworker answer: files it read as chips that open in VS Code,
 * folder listings and searches folded into a quiet count, or an honest
 * "no sources" flag when the answer came from general knowledge.
 */
export function SourceRow({ sources, settled }: { sources: SourceLookup[]; settled: boolean }) {
  const files = useMemo(() => groupReads(sources), [sources])
  const searches = sources.filter(s => s.kind === 'search')
  const listings = sources.filter(s => s.kind === 'list')
  const [showAllFiles, setShowAllFiles] = useState(false)
  const [showLookups, setShowLookups] = useState(false)
  const [notice, setNotice] = useState('')
  const noticeTimer = useRef<number | null>(null)

  useEffect(() => () => { if (noticeTimer.current) window.clearTimeout(noticeTimer.current) }, [])

  const flash = (msg: string) => {
    setNotice(msg)
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(''), 2400)
  }

  const open = async (f: FileGroup) => {
    const line = f.ranges[0]?.start ?? 1
    const r = await api.openInEditor(f.path, line)
    if (r.ok) flash(`Opened ${f.label} in VS Code`)
    else if (r.copied) flash(`VS Code not found. Copied ${f.path}:${line}`)
    else flash(`Couldn't open ${f.label}: ${r.error ?? 'unknown error'}`)
  }

  const copy = async (f: FileGroup) => {
    const ref = f.whole || f.ranges.length === 0 ? f.path : `${f.path}:${formatRanges(f.ranges)}`
    await api.copyText(ref)
    flash(`Copied ${ref}`)
  }

  const lookupCount = searches.length + listings.length
  if (files.length === 0 && lookupCount === 0) {
    if (!settled) return null
    return (
      <p className="src-empty">
        <NoSourceIcon />
        No sources read · general knowledge
      </p>
    )
  }

  const shown = showAllFiles ? files : files.slice(0, VISIBLE_FILES)
  const hidden = files.length - shown.length
  const lookupLabel = [
    searches.length ? `${searches.length} ${searches.length === 1 ? 'search' : 'searches'}` : '',
    listings.length ? `${listings.length} ${listings.length === 1 ? 'folder' : 'folders'}` : ''
  ].filter(Boolean).join(' · ')

  return (
    <div className="src-row">
      <ul className="src-list" aria-label="Sources for this answer">
        {shown.map(f => <FileChip key={f.path} f={f} onOpen={open} onCopy={copy} />)}
        {hidden > 0 && (
          <li>
            <button className="src-more" onClick={() => setShowAllFiles(true)}>+{hidden} more</button>
          </li>
        )}
        {files.length === 0 && settled && <li className="src-meta">No files read</li>}
        {lookupCount > 0 && (
          <li>
            <button className="src-more" aria-expanded={showLookups} onClick={() => setShowLookups(v => !v)}>
              {lookupLabel}
              <svg className={`src-caret ${showLookups ? 'is-open' : ''}`} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
            </button>
          </li>
        )}
      </ul>

      {showLookups && lookupCount > 0 && (
        <ul className="src-lookups allow-select" aria-label="Searches and folder listings">
          {sources.filter(s => s.kind !== 'read').map(s => (
            <li key={s.id} className={s.status === 'error' ? 'is-error' : ''}>
              <span className="src-lookup-kind">{s.kind === 'search' ? 'Searched' : 'Listed'}</span>
              <code>{s.kind === 'search' ? s.pattern : (s.path || '.')}</code>
              {s.status === 'running' && <span className="src-lookup-note">running</span>}
              {s.status === 'error' && <span className="src-lookup-note">failed: {s.error}</span>}
            </li>
          ))}
        </ul>
      )}

      <div className="src-notice" role="status" aria-live="polite">{notice}</div>
    </div>
  )
}

function FileChip({ f, onOpen, onCopy }: { f: FileGroup; onOpen: (f: FileGroup) => void; onCopy: (f: FileGroup) => void }) {
  const rangeText = f.whole || f.ranges.length === 0 ? '' : formatRanges(f.ranges, 1)
  const spokenRange = f.whole ? 'whole file'
    : f.ranges.length === 0 ? ''
    : f.ranges.map(r => r.start === r.end ? `line ${r.start}` : `lines ${r.start} to ${r.end}`).join(', ')

  if (f.status === 'error') {
    return (
      <li className="src-chip is-error" title={`${f.path}\nCouldn't read: ${f.error ?? 'unknown error'}`}>
        <span className="src-chip-main">
          <FileIcon />
          <span className="src-name">{f.label}</span>
          <span className="sr-only">: couldn't read, {f.error}</span>
        </span>
      </li>
    )
  }

  return (
    <li className={`src-chip ${f.status === 'running' ? 'is-running' : ''}`}>
      <button
        className="src-chip-main"
        title={`${f.path}${f.whole ? '' : f.ranges.length ? ':' + formatRanges(f.ranges) : ''}\nOpen in VS Code · right-click to copy`}
        aria-label={`Open ${f.path}${spokenRange ? ', ' + spokenRange : ''}, in VS Code`}
        aria-busy={f.status === 'running' || undefined}
        onClick={() => onOpen(f)}
        onContextMenu={e => { e.preventDefault(); onCopy(f) }}
      >
        {f.status === 'running' ? <span className="src-dot" aria-hidden="true" /> : <FileIcon />}
        <span className="src-name">{f.label}</span>
        {rangeText && <span className="src-range">{rangeText}</span>}
      </button>
      {f.status === 'done' && (
        <button className="src-copy" aria-label={`Copy reference to ${f.path}`} title="Copy path and lines" onClick={() => onCopy(f)}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
        </button>
      )}
    </li>
  )
}

function FileIcon() {
  return (
    <svg className="src-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>
    </svg>
  )
}

function NoSourceIcon() {
  return (
    <svg className="src-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 3" aria-hidden="true">
      <circle cx="12" cy="12" r="9"/>
    </svg>
  )
}

/** "L102–125", or "L10–20, L80–95"; with `max`, extra ranges collapse to "+N". */
function formatRanges(ranges: Range[], max = Infinity): string {
  const parts = ranges.slice(0, max).map(r => r.start === r.end ? `L${r.start}` : `L${r.start}–${r.end}`)
  const extra = ranges.length - parts.length
  return parts.join(', ') + (extra > 0 ? ` +${extra}` : '')
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '')
}

/** One group per file: overlapping or touching ranges merged, whole-file reads detected. */
function groupReads(sources: SourceLookup[]): FileGroup[] {
  const order: string[] = []
  const byPath = new Map<string, SourceLookup[]>()
  for (const s of sources) {
    if (s.kind !== 'read' || !s.path) continue
    const key = normalizePath(s.path)
    if (!byPath.has(key)) { byPath.set(key, []); order.push(key) }
    byPath.get(key)!.push(s)
  }

  const groups: FileGroup[] = order.map(path => {
    const reads = byPath.get(path)!
    const ok = reads.filter(r => r.status === 'done')
    const status: FileGroup['status'] =
      reads.some(r => r.status === 'running') ? 'running'
      : ok.length === 0 ? 'error'
      : 'done'
    const whole = ok.some(r => (r.startLine ?? 1) <= 1 && r.totalLines != null && (r.endLine ?? 0) >= r.totalLines)
    const raw = ok
      .filter(r => r.startLine != null && r.endLine != null)
      .map(r => ({ start: r.startLine!, end: r.endLine! }))
      .sort((a, b) => a.start - b.start)
    const ranges: Range[] = []
    for (const r of raw) {
      const last = ranges[ranges.length - 1]
      if (last && r.start <= last.end + 1) last.end = Math.max(last.end, r.end)
      else ranges.push({ ...r })
    }
    return { path, label: basename(path), ranges, whole, status, error: reads.find(r => r.error)?.error }
  })

  // Same file name in two folders: show the parent folder so the chips stay distinguishable.
  const counts = new Map<string, number>()
  for (const g of groups) counts.set(g.label, (counts.get(g.label) ?? 0) + 1)
  for (const g of groups) {
    if ((counts.get(g.label) ?? 0) > 1) {
      const parts = g.path.split('/')
      g.label = parts.slice(-2).join('/')
    }
  }
  return groups
}

function basename(p: string): string {
  const parts = p.split('/')
  return parts[parts.length - 1] || p
}
