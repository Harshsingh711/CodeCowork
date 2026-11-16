import { promises as fs } from 'fs'
import { createHash } from 'crypto'
import { resolve, relative, sep, join, extname } from 'path'

const EXCLUDED_DIRS = new Set([
  'node_modules', '.git', 'out', 'dist', '.next', '.turbo', '.vite', '.cache',
  'build', 'target', '__pycache__', '.venv', 'venv'
])
const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.tar',
  '.gz', '.exe', '.dll', '.so', '.dylib', '.wasm', '.woff', '.woff2', '.ttf',
  '.mp3', '.mp4', '.mov', '.webm'
])

export class WorkspaceGuard {
  constructor(private root: string) {
    this.root = resolve(root)
  }
  resolveSafe(p: string): string {
    const full = resolve(this.root, p)
    const rel = relative(this.root, full)
    if (rel.startsWith('..') || rel.includes(`..${sep}`)) {
      throw new Error(`Path escapes workspace: ${p}`)
    }
    return full
  }
  rel(full: string): string {
    return relative(this.root, full).replaceAll(sep, '/')
  }
  get rootPath() { return this.root }
}

export async function listDir(ws: WorkspaceGuard, path: string = '.'): Promise<string> {
  const full = ws.resolveSafe(path)
  const entries = await fs.readdir(full, { withFileTypes: true })
  const items = entries
    .filter(e => !EXCLUDED_DIRS.has(e.name) && !e.name.startsWith('.'))
    .map(e => `${e.isDirectory() ? 'DIR  ' : 'FILE '} ${e.name}`)
  return items.join('\n') || '(empty)'
}

export async function readFile(
  ws: WorkspaceGuard,
  path: string,
  startLine?: number,
  endLine?: number
): Promise<{ text: string; hash: string; totalLines: number; startLine: number; endLine: number; relPath: string }> {
  const full = ws.resolveSafe(path)
  if (BINARY_EXT.has(extname(full).toLowerCase())) {
    throw new Error(`Binary file not readable: ${path}`)
  }
  const buf = await fs.readFile(full)
  if (buf.length > 2_000_000) throw new Error(`File too large: ${path}`)
  const text = buf.toString('utf8')
  const hash = createHash('sha256').update(buf).digest('hex').slice(0, 12)
  const lines = text.split('\n')
  const s = Math.max(1, startLine ?? 1)
  const e = Math.min(lines.length, endLine ?? Math.min(lines.length, s + 400))
  const sliced = lines
    .slice(s - 1, e)
    .map((l, i) => `${String(s + i).padStart(5)}  ${l}`)
    .join('\n')
  return { text: sliced, hash, totalLines: lines.length, startLine: s, endLine: e, relPath: ws.rel(full) }
}

export async function grep(
  ws: WorkspaceGuard,
  pattern: string,
  options: { glob?: string; maxResults?: number } = {}
): Promise<string> {
  const re = new RegExp(pattern, 'i')
  const max = options.maxResults ?? 60
  const results: string[] = []
  async function walk(dir: string) {
    if (results.length >= max) return
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      if (results.length >= max) return
      if (EXCLUDED_DIRS.has(e.name) || e.name.startsWith('.')) continue
      const full = join(dir, e.name)
      if (e.isDirectory()) {
        await walk(full)
      } else if (!BINARY_EXT.has(extname(e.name).toLowerCase())) {
        try {
          const buf = await fs.readFile(full)
          if (buf.length > 2_000_000) continue
          const text = buf.toString('utf8')
          const lines = text.split('\n')
          for (let i = 0; i < lines.length; i++) {
            if (re.test(lines[i])) {
              results.push(`${ws.rel(full)}:${i + 1}  ${lines[i].slice(0, 220)}`)
              if (results.length >= max) return
            }
          }
        } catch { /* skip */ }
      }
    }
  }
  await walk(ws.rootPath)
  if (results.length === 0) return '(no matches)'
  return results.join('\n') + (results.length >= max ? `\n(truncated at ${max})` : '')
}

export const TOOL_DEFINITIONS = [
  {
    name: 'list_dir',
    description: 'List entries in a workspace directory. Use "." for the workspace root.',
    input_schema: {
      type: 'object' as const,
      properties: { path: { type: 'string', description: 'Workspace-relative directory path' } },
      required: ['path']
    }
  },
  {
    name: 'read_file',
    description: 'Read a workspace file. Returns up to 400 lines by default; pass start_line/end_line to page.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string' },
        start_line: { type: 'number' },
        end_line: { type: 'number' }
      },
      required: ['path']
    }
  },
  {
    name: 'grep',
    description: 'Regex (case-insensitive) search across the workspace. Returns path:line snippets.',
    input_schema: {
      type: 'object' as const,
      properties: {
        pattern: { type: 'string' },
        max_results: { type: 'number' }
      },
      required: ['pattern']
    }
  },
  {
    name: 'write_note',
    description:
      'Save a short, titled note to the Notes panel in Coworker. Use when the user says "write it down", "save that", "add this to notes", "take notes", or wants a summary or list kept. This is the only thing you can write; it does not touch the workspace.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'A short noun-phrase title (<= 60 chars).' },
        body: { type: 'string', description: 'Markdown body. Keep it tight.' }
      },
      required: ['title', 'body']
    }
  }
]
