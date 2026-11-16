# Coworker

A screen-aware voice coworker — M1 scaffold.

**What's in this scaffold (M1 scope from the PRD):**
- Standalone Electron desktop shell (Windows-first)
- Floating control bar (always-on-top) + main investigation panel
- Dark glass aesthetic, Tailwind-styled, custom frameless titlebar
- Connected-folder workspace with path safety
- Local tools: `list_dir`, `read_file`, `grep` (bounded)
- Anthropic SDK tool-use loop with streaming text
- Customizable personality (presets + free text) and verbosity
- Keyboard global shortcut: `Ctrl+Shift+Space` toggles the main window

**Not yet (M2+):**
- Voice input/output, interruption
- Screen capture / region selection
- Symbol-aware navigation (LSP), source freshness checks

## Setup

```bash
npm install
npm run dev
```

Then in **Settings**:
1. Paste your Anthropic API key.
2. Pick a workspace folder (any repo).
3. Choose model, verbosity, and personality.

## Project structure

```
src/
  main/          Electron main process (window + IPC + tools + investigator)
  preload/       contextBridge API
  renderer/      React UI (main panel + floating control)
  shared/        Shared TS types
```
