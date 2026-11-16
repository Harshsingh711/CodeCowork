import { app, BrowserWindow, ipcMain, dialog, globalShortcut, shell, desktopCapturer, session, clipboard, screen } from 'electron'
import { join } from 'path'
import { appendFileSync, mkdirSync, writeFileSync } from 'fs'
import Store from 'electron-store'
import { WorkspaceGuard } from './tools'
import { investigate } from './investigator'
import { createLiveSession, LIVE_TOOL_SCHEMAS, runLiveTool } from './live'
import type { Settings } from '../shared/types'

const DEFAULT_SETTINGS: Settings = {
  apiKey: process.env.ANTHROPIC_API_KEY ?? '',
  model: 'claude-opus-4-7',
  openaiKey: process.env.OPENAI_API_KEY ?? '',
  realtimeModel: 'gpt-live-1',
  voice: 'gleam',
  workspacePath: null,
  personality: 'Warm, concise, and precise. Flag uncertainty plainly.',
  verbosity: 'balanced',
  voiceOut: true
}

const store = new Store<Settings>({ defaults: DEFAULT_SETTINGS })

let mainWindow: BrowserWindow | null = null
let controlWindow: BrowserWindow | null = null
const activeInvestigations = new Map<string, AbortController>()

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 720,
    minHeight: 520,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0a0b',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })
  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 2) console.log(`[renderer ${level === 3 ? 'error' : 'warn'}] ${message} (${sourceId}:${line})`)
  })
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.log(`[renderer gone] ${details.reason} exit=${details.exitCode}`)
  })
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createControlWindow() {
  controlWindow = new BrowserWindow({
    width: 320,
    height: 68,
    x: 40,
    y: 40,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })
  controlWindow.setAlwaysOnTop(true, 'floating')
  if (process.env['ELECTRON_RENDERER_URL']) {
    controlWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/control.html`)
  } else {
    controlWindow.loadFile(join(__dirname, '../renderer/control.html'))
  }
}

app.whenReady().then(() => {
  session.defaultSession.setDisplayMediaRequestHandler(async (_req, cb) => {
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] })
    cb({ video: sources[0] })
  }, { useSystemPicker: false })

  createMainWindow()
  createControlWindow()

  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    if (!mainWindow) return
    if (mainWindow.isVisible() && mainWindow.isFocused()) mainWindow.hide()
    else { mainWindow.show(); mainWindow.focus() }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => globalShortcut.unregisterAll())

ipcMain.handle('settings:get', () => ({ ...DEFAULT_SETTINGS, ...store.store }))
ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) => {
  for (const [k, v] of Object.entries(patch)) store.set(k as keyof Settings, v as never)
  return store.store
})

ipcMain.handle('workspace:pick', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Connect a workspace',
    properties: ['openDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const path = result.filePaths[0]
  store.set('workspacePath', path)
  return path
})

ipcMain.handle('window:minimize', () => mainWindow?.minimize())
ipcMain.handle('window:toggleMax', () => {
  if (!mainWindow) return
  if (mainWindow.isMaximized()) mainWindow.unmaximize()
  else mainWindow.maximize()
})
ipcMain.handle('window:close', () => mainWindow?.close())
ipcMain.handle('window:showMain', () => { mainWindow?.show(); mainWindow?.focus() })

ipcMain.handle('shell:openPath', (_e, p: string) => shell.openPath(p))

// Open a workspace file in VS Code at a line, via its registered vscode:// URL handler
// (no shell, no PATH lookup). Falls back to copying `path:line` when VS Code isn't installed.
ipcMain.handle('editor:open', async (_e, { path, line }: { path: string; line?: number }) => {
  if (!currentWorkspace) return { ok: false, copied: false, error: 'No workspace' }
  let full: string
  try { full = currentWorkspace.resolveSafe(path) } catch (err: any) {
    return { ok: false, copied: false, error: err?.message ?? String(err) }
  }
  const lineNo = Math.max(1, Math.floor(line ?? 1))
  const hasVsCode = !!app.getApplicationNameForProtocol('vscode://')
  if (hasVsCode) {
    try {
      const url = 'vscode://file/' + encodeURI(full.replaceAll('\\', '/')) + ':' + lineNo
      await shell.openExternal(url)
      return { ok: true, copied: false }
    } catch { /* fall through to copy */ }
  }
  clipboard.writeText(`${currentWorkspace.rel(full)}:${lineNo}`)
  return { ok: false, copied: true, error: 'VS Code not found' }
})

ipcMain.handle('clipboard:write', (_e, text: string) => { clipboard.writeText(String(text)) })

ipcMain.handle('capture:sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['window', 'screen'],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: false
  })
  return sources.map(s => ({
    id: s.id,
    name: s.name,
    thumbnailDataUrl: s.thumbnail.toDataURL(),
    isScreen: s.id.startsWith('screen:')
  }))
})

ipcMain.handle('investigate:start', async (event, payload: { id: string; question: string; history: any[]; imageBase64?: string | null }) => {
  const s = store.store
  if (!s.apiKey) return { ok: false, error: 'Set your Anthropic API key in settings first.' }
  if (!s.workspacePath) return { ok: false, error: 'Connect a workspace folder first.' }
  const ac = new AbortController()
  activeInvestigations.set(payload.id, ac)
  const ws = new WorkspaceGuard(s.workspacePath)
  const send = (ev: Record<string, unknown>) => {
    event.sender.send(`investigate:event:${payload.id}`, ev)
  }
  investigate({
    apiKey: s.apiKey,
    model: s.model,
    workspace: ws,
    question: payload.question,
    personality: s.personality,
    verbosity: s.verbosity,
    history: payload.history,
    imageBase64: payload.imageBase64 ?? null,
    signal: ac.signal,
    onEvent: send
  }).catch((err: any) => {
    send({ type: 'error', error: err?.message ?? String(err) })
  }).finally(() => {
    activeInvestigations.delete(payload.id)
  })
  return { ok: true }
})

ipcMain.handle('investigate:cancel', (_e, id: string) => {
  activeInvestigations.get(id)?.abort()
  activeInvestigations.delete(id)
  return true
})

function buildVoiceInstructions(s: Settings): string {
  return `You are a voice coworker helping the user navigate an unfamiliar codebase.
You hear the user over voice and reply with voice. Speak briefly — one or two sentences for small things, a short paragraph only when the user asks for depth. No preamble like "sure", "let me", "basically". Pronounce code identifiers roughly as they look ("G M M dot pie" for gmm.py, "config" for cfg).

Call tools (list_dir, read_file, grep) before answering substantive questions about the code. Ground claims in what you have actually read; if you did not read it, say so.

You can see the user's screen on request: the look_at_screen tool takes a screenshot of the display they are using. Use it whenever they point at something visible ("this", "this function", "what I'm looking at") or ask if you can see their screen. Never say you cannot see the screen without trying it. What is on screen may differ from the saved file; say so when it does.

When the user says "write it down", "save that", "take notes", or asks for a list/summary to keep, call write_note with a short title and a tight markdown body. Do not dump the whole conversation.

Workspace root: ${s.workspacePath ?? '(not connected)'}.
Personality: ${s.personality || 'warm, concise, precise'}.`
}

let currentWorkspace: WorkspaceGuard | null = null

ipcMain.handle('live:createSession', async (_e, { offerSdp }: { offerSdp: string }) => {
  const s = store.store as Settings
  if (!s.openaiKey) return { ok: false, error: 'Set your OpenAI API key in Settings.' }
  if (!s.workspacePath) return { ok: false, error: 'Connect a workspace folder first.' }
  currentWorkspace = new WorkspaceGuard(s.workspacePath)
  try {
    const { answerSdp } = await createLiveSession({
      openaiKey: s.openaiKey,
      model: s.realtimeModel,
      voice: s.voice,
      delegateModel: 'gpt-6-luna',
      reasoningEffort: 'medium',
      instructions: buildVoiceInstructions(s)
    }, offerSdp)
    return {
      ok: true,
      answerSdp,
      tools: LIVE_TOOL_SCHEMAS,
      instructions: buildVoiceInstructions(s)
    }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) }
  }
})

const LIVE_LOG = join(process.cwd(), 'logs', 'live-events.jsonl')

ipcMain.on('live:resetLog', () => {
  try {
    mkdirSync(join(process.cwd(), 'logs'), { recursive: true })
    writeFileSync(LIVE_LOG, '')
  } catch { /* logging is best-effort */ }
})

ipcMain.on('live:log', (_e, entry: unknown) => {
  try { appendFileSync(LIVE_LOG, JSON.stringify(entry) + '\n') } catch { /* best-effort */ }
})

// Screenshot of the display the user is working on (the one under the cursor), as a JPEG data URL
// small enough to fit in one data-channel message.
ipcMain.handle('live:captureScreen', async (_e, { maxChars }: { maxChars: number }) => {
  try {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const px = { width: Math.round(display.size.width * display.scaleFactor), height: Math.round(display.size.height * display.scaleFactor) }
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: px })
    const src = sources.find(s => s.display_id === String(display.id)) ?? sources[0]
    if (!src || src.thumbnail.isEmpty()) return { ok: false, error: 'No screen available to capture' }
    const budget = Math.max(20000, Math.floor(maxChars || 0))
    const prefix = 'data:image/jpeg;base64,'
    // Step down size and quality until the image fits the budget.
    for (const width of [1920, 1600, 1366, 1200, 1024, 800, 640]) {
      const img = src.thumbnail.getSize().width > width ? src.thumbnail.resize({ width, quality: 'best' }) : src.thumbnail
      for (const quality of [80, 65, 50]) {
        const b64 = img.toJPEG(quality).toString('base64')
        if (prefix.length + b64.length <= budget) {
          const size = img.getSize()
          return { ok: true, dataUrl: prefix + b64, width: size.width, height: size.height }
        }
      }
    }
    return { ok: false, error: 'Screenshot too large to send' }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) }
  }
})

ipcMain.handle('live:runTool', async (_e, { name, args }: { name: string; args: any }) => {
  if (!currentWorkspace) return { ok: false, error: 'No workspace' }
  try {
    const r = await runLiveTool(currentWorkspace, name, args)
    return { ok: true, output: r.output, note: r.note ?? null, source: r.source ?? null }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err), output: `ERROR: ${err?.message ?? err}` }
  }
})
