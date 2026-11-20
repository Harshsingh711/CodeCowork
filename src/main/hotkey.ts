import { uIOhook, UiohookKey } from 'uiohook-napi'

type Modifier = 'ctrl' | 'alt' | 'shift'

const MODIFIERS = new Map<number, Modifier>([
  [UiohookKey.Ctrl, 'ctrl'], [UiohookKey.CtrlRight, 'ctrl'],
  [UiohookKey.Alt, 'alt'], [UiohookKey.AltRight, 'alt'],
  [UiohookKey.Shift, 'shift'], [UiohookKey.ShiftRight, 'shift']
])

// The three keys must go down within this long of each other. Also keeps a missed key-up
// (lock screen, admin prompt) from leaving a modifier counted as held forever.
const CHORD_WINDOW_MS = 1500

/**
 * Calls `onChord` when Ctrl+Alt+Shift are pressed together and let go with nothing else pressed
 * in between, so shortcuts that merely start with those keys (Ctrl+Alt+Shift+S) are left alone.
 * Electron's globalShortcut cannot register a shortcut made of modifiers only, hence the hook.
 */
export function watchCtrlAltShift(onChord: () => void): () => void {
  const downAt = new Map<Modifier, number>()
  let armed = false

  uIOhook.on('keydown', e => {
    const mod = MODIFIERS.get(e.keycode)
    if (!mod || e.metaKey) { armed = false; return }
    const now = Date.now()
    if (!downAt.has(mod)) downAt.set(mod, now)
    if (downAt.size === 3 && now - Math.min(...downAt.values()) <= CHORD_WINDOW_MS) armed = true
  })
  uIOhook.on('keyup', e => {
    const mod = MODIFIERS.get(e.keycode)
    if (!mod) return
    downAt.delete(mod)
    if (armed) { armed = false; onChord() }
  })
  uIOhook.on('mousedown', () => { armed = false })
  uIOhook.on('wheel', () => { armed = false })

  uIOhook.start()
  return () => uIOhook.stop()
}
