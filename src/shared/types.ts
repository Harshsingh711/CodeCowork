export type Role = 'user' | 'assistant' | 'tool'

export interface Citation {
  path: string
  startLine: number
  endLine: number
  excerpt: string
  hash: string
}

export interface ToolCall {
  id: string
  name: string
  input: unknown
  status: 'running' | 'done' | 'error'
  resultPreview?: string
  errorMessage?: string
}

export interface Message {
  id: string
  role: Role
  text: string
  citations?: Citation[]
  toolCalls?: ToolCall[]
  createdAt: number
}

export interface Settings {
  apiKey: string
  model: string
  openaiKey: string
  realtimeModel: string
  voice: string
  workspacePath: string | null
  personality: string
  verbosity: 'brief' | 'balanced' | 'detailed'
  voiceOut: boolean
}

export interface Note {
  id: string
  title: string
  body: string
  createdAt: number
}

/** One lookup the coworker made while forming an answer. */
export interface SourceLookup {
  id: string
  kind: 'read' | 'search' | 'list'
  status: 'running' | 'done' | 'error'
  /** Workspace-relative path, forward slashes (read / list). */
  path?: string
  /** 1-based inclusive line range actually read. */
  startLine?: number
  endLine?: number
  totalLines?: number
  hash?: string
  /** grep pattern (search). */
  pattern?: string
  error?: string
}

/** What the main process reports back about a tool call, for display. */
export interface SourceMeta {
  kind: 'read' | 'search' | 'list'
  path?: string
  startLine?: number
  endLine?: number
  totalLines?: number
  hash?: string
  pattern?: string
}

export interface TranscriptEntry {
  id: string
  role: 'user' | 'assistant'
  text: string
  partial?: boolean
  createdAt: number
  /** Assistant only: lookups made while forming this answer. */
  sources?: SourceLookup[]
}

export interface InvestigationUpdate {
  type: 'tool_start' | 'tool_done' | 'tool_error' | 'text_delta' | 'done' | 'error'
  payload: unknown
}
