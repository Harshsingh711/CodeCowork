import { WorkspaceGuard, listDir, readFile, grep } from './tools'
import { randomUUID } from 'crypto'
import type { SourceMeta } from '../shared/types'

export interface LiveSessionConfig {
  openaiKey: string
  model: string
  voice: string
  delegateModel: string
  reasoningEffort: 'low' | 'medium' | 'high'
  instructions: string
}

export async function createLiveSession(cfg: LiveSessionConfig, offerSdp: string): Promise<{
  answerSdp: string
  rawResponse: any
}> {
  const session = {
    model: cfg.model,
    audio: {
      output: { voice: cfg.voice }
    },
    instructions: cfg.instructions,
    delegation: {
      type: 'responses',
      responses: {
        parallel_tool_calls: false,
        model: cfg.delegateModel,
        reasoning: { effort: cfg.reasoningEffort },
        tools: [...LIVE_TOOL_SCHEMAS, { type: 'web_search' }]
      }
    }
  }
  const body = {
    session,
    transport: { type: 'webrtc', sdp: offerSdp }
  }
  const res = await fetch('https://api.openai.com/v1/live/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.openaiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Live session failed (${res.status}): ${text.slice(0, 300)}`)
  }
  const json = await res.json() as any
  const answerSdp = json?.transport?.sdp
  if (!answerSdp) throw new Error('Live session returned no SDP answer')
  return { answerSdp, rawResponse: json }
}

export const LIVE_TOOL_SCHEMAS = [
  {
    type: 'function',
    name: 'list_dir',
    description: 'List entries in a workspace directory. Use "." for the workspace root.',
    parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }
  },
  {
    type: 'function',
    name: 'read_file',
    description: 'Read a workspace file (up to 400 lines by default).',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        start_line: { type: 'number' },
        end_line: { type: 'number' }
      },
      required: ['path']
    }
  },
  {
    type: 'function',
    name: 'grep',
    description: 'Case-insensitive regex search across the workspace. Returns path:line snippets.',
    parameters: {
      type: 'object',
      properties: { pattern: { type: 'string' }, max_results: { type: 'number' } },
      required: ['pattern']
    }
  },
  {
    type: 'function',
    name: 'look_at_screen',
    description:
      'Take a screenshot of the screen the user is looking at right now. Call this whenever the user refers to something visible ("this", "this function", "what I am looking at", "on my screen") or asks whether you can see their screen. The screenshot arrives as an image right after the tool result.',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  {
    type: 'function',
    name: 'write_note',
    description:
      'Write a short, titled note to the user\'s Notes panel. Use when the user says "write it down", "save that", "take notes", or wants a list/summary preserved.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'A short noun-phrase title (<= 60 chars).' },
        body: { type: 'string', description: 'Markdown body. Keep it tight.' }
      },
      required: ['title', 'body']
    }
  }
]

export async function runLiveTool(
  ws: WorkspaceGuard,
  name: string,
  args: any
): Promise<{ output: string; note?: { id: string; title: string; body: string; createdAt: number }; source?: SourceMeta }> {
  if (name === 'list_dir') {
    const path = args?.path ?? '.'
    const output = await listDir(ws, path)
    return { output, source: { kind: 'list', path: ws.rel(ws.resolveSafe(path)) || '.' } }
  }
  if (name === 'read_file') {
    const r = await readFile(ws, args.path, args.start_line, args.end_line)
    return {
      output: `path=${args.path} hash=${r.hash} lines=${r.totalLines}\n---\n${r.text}`,
      source: { kind: 'read', path: r.relPath, startLine: r.startLine, endLine: r.endLine, totalLines: r.totalLines, hash: r.hash }
    }
  }
  if (name === 'grep') {
    return {
      output: await grep(ws, args.pattern, { maxResults: args.max_results }),
      source: { kind: 'search', pattern: String(args.pattern ?? '') }
    }
  }
  if (name === 'write_note') {
    const note = {
      id: randomUUID(),
      title: (args?.title ?? 'Note').toString().slice(0, 120),
      body: (args?.body ?? '').toString(),
      createdAt: Date.now()
    }
    return { output: `Note "${note.title}" saved.`, note }
  }
  return { output: `Unknown tool: ${name}` }
}
