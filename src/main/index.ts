import { app, BrowserWindow, ipcMain, dialog, shell, desktopCapturer, session, clipboard, screen } from 'electron'
import { join } from 'path'
import { appendFileSync, mkdirSync, writeFileSync } from 'fs'
import Store from 'electron-store'
import { WorkspaceGuard } from './tools'
import { investigate } from './investigator'
import { createLiveSession, LIVE_TOOL_SCHEMAS, runLiveTool } from './live'
import { watchCtrlAltShift } from './hotkey'
import { randomUUID } from 'crypto'
import type { Note, Settings } from '../shared/types'

const DEFAULT_SETTINGS: Settings = {
  apiKey: process.env.ANTHROPIC_API_KEY ?? '',
  model: 'claude-opus-4-7',
  openaiKey: process.env.OPENAI_API_KEY ?? '',
  realtimeModel: 'gpt-live-1',
  voice: 'gleam',
  workspacePath: null,
  personality: 'Warm, concise, and precise. Flag uncertainty plainly.',
  verbosity: 'balanced',
  voiceOut: true,
  shareScreen: true
}

const store = new Store<Settings>({ defaults: DEFAULT_SETTINGS })

// Notes are saved on disk and shared by every window, whether they came from voice or the text bar.
const notesStore = new Store<{ notes: Note[] }>({ name: 'notes', defaults: { notes: [] } })
const MAX_NOTES = 200

function broadcastNotes() {
  const notes = notesStore.get('notes')
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('notes:changed', notes)
  }
}

function addNote(title: string, body: string): Note {
  const note: Note = {
    id: randomUUID(),
    title: (title || 'Note').toString().slice(0, 120),
    body: (body ?? '').toString(),
    createdAt: Date.now()
  }
  notesStore.set('notes', [note, ...notesStore.get('notes')].slice(0, MAX_NOTES))
  broadcastNotes()
  return note
}

ipcMain.handle('notes:list', () => notesStore.get('notes'))
ipcMain.handle('notes:delete', (_e, id: string) => {
  notesStore.set('notes', notesStore.get('notes').filter(n => n.id !== id))
  broadcastNotes()
})

let mainWindow: BrowserWindow | null = null
let controlWindow: BrowserWindow | null = null
let textBarWindow: BrowserWindow | null = null
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
  mainWindow.on('closed', () => { mainWindow = null })
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

// Not 'floating': on Windows that level parks the window just behind the taskbar, and whenever the
// taskbar is not top-most itself (a fullscreen app is open) the window stops being always-on-top
// and sinks behind other apps.
const ON_TOP_LEVEL = 'screen-saver'

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
  controlWindow.setAlwaysOnTop(true, ON_TOP_LEVEL)
  if (process.env['ELECTRON_RENDERER_URL']) {
    controlWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/control.html`)
  } else {
    controlWindow.loadFile(join(__dirname, '../renderer/control.html'))
  }
}

// ── Text bar ──────────────────────────────────────────────────────────────
// A Spotlight-style prompt that floats over whatever the user is doing. It is created once and
// shown/hidden, so the conversation survives between uses.
const TEXTBAR_WIDTH = 760
const TEXTBAR_MIN_HEIGHT = 96
const TEXTBAR_MAX_HEIGHT = 660
let textBarHideTimer: NodeJS.Timeout | null = null
// The bar's left and bottom edges stay put; answers grow upward from there.
let textBarAnchor: { x: number; bottom: number } | null = null
// Our own setBounds calls also fire move events; only moves outside this window of time are the user's.
let textBarSelfMoveAt = 0
// True while the folder picker is open, so losing focus to it does not dismiss the bar.
let textBarPicking = false
// Last content height the page reported; it reports once before the bar has ever been shown.
let textBarHeight = TEXTBAR_MIN_HEIGHT

/** Place the window so its bottom edge sits on the anchor, without leaving the screen. */
function placeTextBar(height: number) {
  const win = textBarWindow
  if (!win || win.isDestroyed() || !textBarAnchor) return
  const area = screen.getDisplayNearestPoint({ x: textBarAnchor.x + TEXTBAR_WIDTH / 2, y: textBarAnchor.bottom }).workArea
  const h = Math.max(TEXTBAR_MIN_HEIGHT, Math.min(TEXTBAR_MAX_HEIGHT, area.height, Math.ceil(height)))
  // If there is not enough room above, the bar slides down just enough to fit.
  const y = Math.max(area.y, Math.min(textBarAnchor.bottom, area.y + area.height) - h)
  const next = { x: Math.round(textBarAnchor.x), y: Math.round(y), width: TEXTBAR_WIDTH, height: h }
  const b = win.getBounds()
  if (b.x === next.x && b.y === next.y && b.height === next.height) return
  textBarSelfMoveAt = Date.now()
  win.setBounds(next)
}

function createTextBarWindow() {
  textBarWindow = new BrowserWindow({
    width: TEXTBAR_WIDTH,
    height: TEXTBAR_MIN_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })
  textBarWindow.setAlwaysOnTop(true, ON_TOP_LEVEL)
  // Clicking away closes it, unless it is pinned or the folder picker has focus.
  // The page plays its exit animation, then hides.
  textBarWindow.on('blur', () => { if (!textBarPicking && !store.get('textBarPinned')) requestTextBarHide() })
  textBarWindow.on('closed', () => { textBarWindow = null })
  // The user dragged it: remember the new spot for next time.
  textBarWindow.on('moved', () => {
    const win = textBarWindow
    if (!win || Date.now() - textBarSelfMoveAt < 250) return
    const b = win.getBounds()
    textBarAnchor = { x: b.x, bottom: b.y + b.height }
    store.set('textBarPos', textBarAnchor)
  })
  if (process.env['ELECTRON_RENDERER_URL']) {
    textBarWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/textbar.html`)
  } else {
    textBarWindow.loadFile(join(__dirname, '../renderer/textbar.html'))
  }
}

function requestTextBarHide() {
  const win = textBarWindow
  if (!win || !win.isVisible()) return
  win.webContents.send('textbar:hide-request')
  // If the page never answers, hide anyway.
  if (textBarHideTimer) clearTimeout(textBarHideTimer)
  textBarHideTimer = setTimeout(() => { if (!win.isDestroyed()) win.hide() }, 400)
}

/** Bring the bar to the front and put the cursor in it, even when another app has the keyboard. */
function focusTextBar(win: BrowserWindow) {
  win.setAlwaysOnTop(true, ON_TOP_LEVEL)
  win.show()
  win.focus()
  win.webContents.focus()
  win.webContents.send('textbar:shown')
}

function toggleTextBar() {
  if (!textBarWindow) createTextBarWindow()
  const win = textBarWindow!
  if (win.isVisible()) {
    // Pinned and left in the background: the shortcut returns to it instead of closing it.
    if (win.isFocused()) requestTextBarHide()
    else focusTextBar(win)
    return
  }
  if (textBarHideTimer) { clearTimeout(textBarHideTimer); textBarHideTimer = null }

  const s = { ...DEFAULT_SETTINGS, ...store.store } as Settings

  // Where the user left it, if that spot is still on a screen; otherwise centred, a little below
  // the middle of the display they are working on, leaving room for answers above.
  const saved = s.textBarPos
  const onScreen = saved && screen.getAllDisplays().some(d =>
    saved.x + TEXTBAR_WIDTH / 2 >= d.workArea.x && saved.x + TEXTBAR_WIDTH / 2 <= d.workArea.x + d.workArea.width &&
    saved.bottom > d.workArea.y + TEXTBAR_MIN_HEIGHT && saved.bottom <= d.workArea.y + d.workArea.height)
  if (saved && onScreen) {
    textBarAnchor = { x: saved.x, bottom: saved.bottom }
  } else {
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
    textBarAnchor = {
      x: Math.round(area.x + (area.width - TEXTBAR_WIDTH) / 2),
      bottom: Math.round(area.y + area.height * 0.66)
    }
  }
  placeTextBar(textBarHeight)
  focusTextBar(win)
}

/**
 * Screenshot for a text bar question, taken when the question is sent so it shows what the user
 * is looking at now (the bar can stay open, pinned, while they move around). The bar is kept out
 * of the picture by excluding it from capture for a moment. Raw base64 JPEG, or null.
 */
async function captureForTextBar(): Promise<string | null> {
  const win = textBarWindow
  const hideBar = !!win && !win.isDestroyed() && win.isVisible()
  if (hideBar) {
    win.setContentProtection(true)
    await new Promise(r => setTimeout(r, 60)) // let the compositor drop the bar from the next frame
  }
  try {
    const shot = await captureDisplay(1_400_000)
    return shot.ok && shot.dataUrl ? shot.dataUrl.slice(shot.dataUrl.indexOf(',') + 1) : null
  } finally {
    if (hideBar && !win.isDestroyed()) win.setContentProtection(false)
  }
}

// Choose a different workspace folder without leaving the text bar.
ipcMain.handle('textbar:pickWorkspace', async () => {
  const win = textBarWindow
  if (!win || win.isDestroyed()) return null
  textBarPicking = true
  try {
    const result = await dialog.showOpenDialog(win, {
      title: 'Choose a workspace folder',
      defaultPath: (store.store as Settings).workspacePath ?? undefined,
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    store.set('workspacePath', result.filePaths[0])
    return result.filePaths[0]
  } finally {
    textBarPicking = false
    if (!win.isDestroyed() && win.isVisible()) win.focus()
  }
})

ipcMain.handle('textbar:hide', () => {
  if (textBarHideTimer) { clearTimeout(textBarHideTimer); textBarHideTimer = null }
  textBarWindow?.hide()
})
// The page reports its content height; the window follows so nothing outside the bar blocks clicks.
ipcMain.handle('textbar:resize', (_e, height: number) => {
  textBarHeight = height
  placeTextBar(height)
})

app.whenReady().then(() => {
  session.defaultSession.setDisplayMediaRequestHandler(async (_req, cb) => {
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] })
    cb({ video: sources[0] })
  }, { useSystemPicker: false })

  createMainWindow()
  createControlWindow()

  createTextBarWindow()

  // Ctrl+Alt+Shift opens the text bar. The main window opens from the control bar's Open button.
  const stopHotkey = watchCtrlAltShift(toggleTextBar)
  app.on('will-quit', stopHotkey)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

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
ipcMain.handle('window:showMain', () => {
  // The main window may have been closed from its titlebar; the control bar can bring it back.
  if (!mainWindow) createMainWindow()
  else { mainWindow.show(); mainWindow.focus() }
})
// Quit for good: closes both windows and ends the process (used by the control bar's close button).
ipcMain.handle('app:quit', () => app.quit())

ipcMain.handle('shell:openPath', (_e, p: string) => shell.openPath(p))

// Open a workspace file in VS Code at a line, via its registered vscode:// URL handler
// (no shell, no PATH lookup). Falls back to copying `path:line` when VS Code isn't installed.
ipcMain.handle('editor:open', async (_e, { path, line }: { path: string; line?: number }) => {
  const ws = activeWorkspace()
  if (!ws) return { ok: false, copied: false, error: 'No workspace' }
  let full: string
  try { full = ws.resolveSafe(path) } catch (err: any) {
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
  clipboard.writeText(`${ws.rel(full)}:${lineNo}`)
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

ipcMain.handle('investigate:start', async (event, payload: { id: string; question: string; history: any[]; imageBase64?: string | null; useScreen?: boolean }) => {
  const s = store.store
  if (!s.apiKey) return { ok: false, error: 'Set your Anthropic API key in settings first.' }
  if (!s.workspacePath) return { ok: false, error: 'Connect a workspace folder first.' }
  const ac = new AbortController()
  activeInvestigations.set(payload.id, ac)
  const ws = new WorkspaceGuard(s.workspacePath)
  const send = (ev: Record<string, unknown>) => {
    event.sender.send(`investigate:event:${payload.id}`, ev)
  }
  const imageBase64 = payload.imageBase64 ?? (payload.useScreen ? await captureForTextBar() : null)
  investigate({
    apiKey: s.apiKey,
    model: s.model,
    workspace: ws,
    question: payload.question,
    personality: s.personality,
    verbosity: s.verbosity,
    history: payload.history,
    imageBase64,
    signal: ac.signal,
    saveNote: (title, body) => addNote(title, body).title,
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

/** The workspace of the live voice session, or the one saved in settings when no session has started. */
function activeWorkspace(): WorkspaceGuard | null {
  if (currentWorkspace) return currentWorkspace
  const p = (store.store as Settings).workspacePath
  return p ? new WorkspaceGuard(p) : null
}

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
ipcMain.handle('live:captureScreen', (_e, { maxChars }: { maxChars: number }) => captureDisplay(maxChars))

async function captureDisplay(maxChars: number): Promise<{ ok: boolean; dataUrl?: string; width?: number; height?: number; error?: string }> {
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
}

ipcMain.handle('live:runTool', async (_e, { name, args }: { name: string; args: any }) => {
  if (!currentWorkspace) return { ok: false, error: 'No workspace' }
  try {
    const r = await runLiveTool(currentWorkspace, name, args)
    // Voice notes go into the same saved list; windows hear about it through notes:changed.
    if (r.note) addNote(r.note.title, r.note.body)
    return { ok: true, output: r.output, note: r.note ?? null, source: r.source ?? null }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err), output: `ERROR: ${err?.message ?? err}` }
  }
})
