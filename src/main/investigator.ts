import Anthropic from '@anthropic-ai/sdk'
import { TOOL_DEFINITIONS, WorkspaceGuard, grep, listDir, readFile } from './tools'

export interface InvestigateOpts {
  apiKey: string
  model: string
  workspace: WorkspaceGuard
  question: string
  personality: string
  verbosity: 'brief' | 'balanced' | 'detailed'
  history: { role: 'user' | 'assistant'; content: string }[]
  imageBase64?: string | null
  signal: AbortSignal
  onEvent: (ev: Record<string, unknown>) => void
}

const BASE_SYSTEM = `You are a focused screen-aware coworker that investigates an unfamiliar codebase to answer the user's questions.

Rules:
- Investigate by calling tools (list_dir, read_file, grep) before answering substantive questions.
- Ground every claim about the code in files you have read. Mark anything you cannot verify as "unverified" or "inferred".
- Never claim a test or program ran — you cannot execute code.
- When you cite code, include the workspace-relative path and line range you actually read.

Writing style — follow strictly:
- Lead with the answer. No preamble ("Let me…", "I'll…", "Great question", "Basically", "So…").
- Short sentences. Cut filler words. Prefer concrete nouns and verbs over hedges.
- Use GitHub-flavored markdown: short bold headings only when they help; tight bullets; backticks for code and paths.
- Cite with inline backticks like \`gmm.py:170-177\` — never a parenthetical "(file:line)".
- No closing summary paragraph. End when the answer is complete.
- Because this answer will be spoken aloud, keep it readable without the formatting too.`

function buildSystem(opts: InvestigateOpts): string {
  const verbosityHint = {
    brief: 'Answer in 1–2 short sentences. One line is often enough.',
    balanced: 'Answer in 2–5 tight sentences. Bullets only when there are 3+ parallel items.',
    detailed: 'Thorough but still compact. Structure only when it earns its space.'
  }[opts.verbosity]
  const persona = opts.personality.trim()
    ? `\n\nPersonality: ${opts.personality.trim()}`
    : ''
  return `${BASE_SYSTEM}\n\n${verbosityHint}\nWorkspace root: ${opts.workspace.rootPath}${persona}`
}

async function runTool(ws: WorkspaceGuard, name: string, input: any): Promise<string> {
  if (name === 'list_dir') return await listDir(ws, input?.path ?? '.')
  if (name === 'read_file') {
    const r = await readFile(ws, input.path, input.start_line, input.end_line)
    return `path=${input.path} hash=${r.hash} lines=${r.totalLines}\n---\n${r.text}`
  }
  if (name === 'grep') return await grep(ws, input.pattern, { maxResults: input.max_results })
  throw new Error(`Unknown tool: ${name}`)
}

export async function investigate(opts: InvestigateOpts): Promise<void> {
  const client = new Anthropic({ apiKey: opts.apiKey })
  const userContent: Anthropic.ContentBlockParam[] = []
  if (opts.imageBase64) {
    userContent.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: opts.imageBase64 }
    })
    userContent.push({ type: 'text', text:
      `(The image above is a screenshot of what the user is looking at right now. ` +
      `Resolve references like "this function" or "this file" against it when relevant. ` +
      `Visible screen text may differ from saved file contents — flag discrepancies.)` })
  }
  userContent.push({ type: 'text', text: opts.question })
  const messages: Anthropic.MessageParam[] = [
    ...opts.history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userContent }
  ]

  const MAX_ITERATIONS = 12
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    if (opts.signal.aborted) {
      opts.onEvent({ type: 'cancelled' })
      return
    }

    let assistantText = ''
    const toolUses: { id: string; name: string; input: any }[] = []

    const stream = client.messages.stream({
      model: opts.model,
      max_tokens: 4096,
      system: buildSystem(opts),
      tools: TOOL_DEFINITIONS,
      messages
    }, { signal: opts.signal })

    stream.on('text', (delta: string) => {
      assistantText += delta
      opts.onEvent({ type: 'text_delta', delta })
    })

    const finalMessage = await stream.finalMessage()

    for (const block of finalMessage.content) {
      if (block.type === 'tool_use') {
        toolUses.push({ id: block.id, name: block.name, input: block.input })
      }
    }

    messages.push({ role: 'assistant', content: finalMessage.content })

    if (toolUses.length === 0 || finalMessage.stop_reason === 'end_turn') {
      opts.onEvent({ type: 'done', text: assistantText })
      return
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const tu of toolUses) {
      if (opts.signal.aborted) {
        opts.onEvent({ type: 'cancelled' })
        return
      }
      opts.onEvent({ type: 'tool_start', id: tu.id, name: tu.name, input: tu.input })
      try {
        const out = await runTool(opts.workspace, tu.name, tu.input)
        opts.onEvent({ type: 'tool_done', id: tu.id, preview: out.slice(0, 240) })
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: out })
      } catch (err: any) {
        const msg = err?.message ?? String(err)
        opts.onEvent({ type: 'tool_error', id: tu.id, error: msg })
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: `ERROR: ${msg}`, is_error: true })
      }
    }
    messages.push({ role: 'user', content: toolResults })
  }

  opts.onEvent({ type: 'error', error: 'Exceeded max investigation iterations' })
}
