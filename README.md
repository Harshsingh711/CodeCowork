# Coworker

A screen-aware voice coworker for finding your way around an unfamiliar codebase.

You connect a folder, start a voice session, and ask questions out loud while your eyes stay on the code: *"Where does the voice session get its tools?"*, *"What does this function do?"*, *"What am I looking at right now?"*. Coworker reads the files it needs, can take a look at your screen, answers out loud, and shows the exact files and line ranges it read under every answer, so you can check it rather than trust it.

It is a Windows-first Electron desktop app. It only ever **reads** your code; it never edits or runs it.

---

## Contents

- [What it does](#what-it-does)
- [Getting started](#getting-started)
- [Using it](#using-it)
- [Settings](#settings)
- [How it works](#how-it-works)
- [Project structure](#project-structure)
- [How it was made](#how-it-was-made)
- [Troubleshooting](#troubleshooting)
- [Limitations and roadmap](#limitations-and-roadmap)

---

## What it does

- **Talk to it like a colleague.** A full-duplex voice session: you speak, it answers out loud, and you can interrupt it mid-sentence.
- **It looks things up before it answers.** For anything about the code it lists folders, searches with regex, and reads files in the connected workspace, then answers from what it actually read.
- **It can see your screen.** When you say "this" or "what I'm looking at", it screenshots the monitor your cursor is on and uses that as context.
- **Every answer shows its sources.** Under each answer, chips like `live.ts L13–60` list the files and line ranges it read. Click one to open VS Code at that line, or right-click to copy `path:lines`. Searches and folder listings fold into a quiet count ("2 searches · 1 folder"), and an answer that read nothing is flagged *"No sources read · general knowledge"*.
- **Live transcript.** Everything you and Coworker say appears in the Transcript tab as it is spoken.
- **Notes.** Say "write it down" or "save that" and it writes a short titled note to the Notes tab.
- **Out of the way.** A small always-on-top control bar, and `Ctrl+Shift+Space` shows or hides the main window from anywhere.
- **Your setup, your keys.** You bring your own API keys; they are stored locally on your machine. There is no account and no hosted backend.

## Getting started

### Requirements

- **Windows 10 or 11** (Windows is the main target; macOS and Linux are untested).
- **Node.js 18 or newer** and npm.
- **An OpenAI API key** with access to the Live API (`gpt-live-1`). Voice sessions run on OpenAI. Keys start with `sk-proj-` or `sk-`, and you can create one at [platform.openai.com/api-keys](https://platform.openai.com/api-keys).
- A microphone.
- **Optional:** [VS Code](https://code.visualstudio.com/), so source chips can open files at the right line.

### Install and run

```bash
git clone https://github.com/Harshsingh711/CodeCowork.git
cd CodeCowork
npm install
npm run dev
```

Run `npm run dev` from inside the `CodeCowork` folder; running it from anywhere else fails with `Could not read package.json`.

### First-time setup

1. In the app, open **Settings**.
2. Paste your **OpenAI API key** into the *OpenAI API key* field. (An Anthropic `sk-ant-` key does not go here; see [Troubleshooting](#troubleshooting).)
3. Under **Workspace folder**, pick the repository you want to ask about. Coworker can only read inside this folder.
4. Optionally choose a voice, a verbosity level, and a personality.
5. Go back to **Voice session** and press **Start voice session**. Allow microphone access if Windows asks.

If `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` is set in the environment you launch the app from, it is used as the default until you save a key in Settings.

### Other scripts

| Command | What it does |
|---|---|
| `npm run dev` | Starts the app with hot reload for the UI. |
| `npm run build` | Builds the main, preload and renderer bundles into `out/`. |
| `npm start` | Runs the built app from `out/`. |
| `npm run typecheck` | Type-checks the main process and the UI. |

There is no packaged installer yet.

## Using it

1. Start a voice session and just talk. The orb shows the state: listening, hearing you, thinking, speaking.
2. Ask about the code. While Coworker reads files, their chips appear under its answer with a soft pulse, then settle once read.
3. Click a chip to jump to that file and line in VS Code. Right-click it, or use the copy button that appears on hover, to copy the reference.
4. Point at things on screen: *"What does this function do?"* Coworker takes a screenshot, and mentions it when what's on screen differs from the saved file.
5. Talk over it to interrupt, and press **End session** when you are done.

The **Raw** tab shows every event on the voice connection, which is useful when something goes wrong. The same events are written to `logs/live-events.jsonl` (ignored by git; it contains your transcripts).

## Settings

| Setting | Notes |
|---|---|
| OpenAI API key | Required for voice. Stored locally and sent only to OpenAI. |
| Voice | The spoken voice, for example `gleam`, `alloy`, `echo`, `shimmer`, `ash`, `ballad`, `coral`, `sage`, `verse`. |
| Voice model | `gpt-live-1`. Reasoning and tool use are delegated to `gpt-6-luna`. |
| Anthropic API key | Optional. Used only by the text investigation mode, which is built but not yet connected to the UI. |
| Workspace folder | The only folder Coworker may read. |
| Verbosity | Brief, balanced or detailed answers. |
| Personality | A preset (Grounded, Terse senior engineer, Patient teacher, Playful rubber-duck) or your own description. |

Settings are saved with `electron-store` in `%APPDATA%\coworker`, outside the repository.

## How it works

```
                         ┌───────────────────────────── OpenAI Live API ─────────────────────────────┐
  your voice  ──audio──▶ │  gpt-live-1  (hears you, speaks)                                           │
  its voice   ◀──audio── │      │ hands off reasoning and tool use                                    │
                         │      ▼                                                                     │
                         │  gpt-6-luna  (Responses delegation: decides which files to read, etc.)     │
                         └──────┬──────────────────────────────────────────────────▲──────────────────┘
                                │ function calls, wrapped in response.event          │ results + screenshots
                                ▼  (WebRTC data channel)                              │ response.item.create
                   ┌──────────────────────────── Renderer (React UI) ──────────────────────────────┐
                   │ useVoice: transcript, status, runs each call, answers all calls, then          │
                   │           response.create so the backend continues                             │
                   └──────┬────────────────────────────────────────────────────────────────────────┘
                          │ IPC (preload bridge)
                   ┌──────▼──────────────────── Main process (Electron) ───────────────────────────┐
                   │ list_dir · read_file · grep   (confined to the workspace folder)               │
                   │ look_at_screen                (desktopCapturer → JPEG sized to fit)             │
                   │ write_note · open in VS Code · settings · window management                    │
                   └───────────────────────────────────────────────────────────────────────────────┘
```

**The voice session.** The UI opens a WebRTC connection: microphone audio goes up, spoken audio comes back, and JSON events travel on a data channel. The main process creates the session with your OpenAI key, so the key never reaches the web page. `gpt-live-1` handles the conversation and delegates real work to a reasoning model, `gpt-6-luna`, through the Responses API.

**Tool calls.** When the reasoning model wants to read something, it emits a function call inside a `response.event` envelope. The UI collects every call in that response, runs each one through the main process, then sends one `function_call_output` per call with `response.item.create`, followed by `response.create` so the model continues. An unanswered call would stall the whole session, so every call is always answered, with an error message if it failed.

**The tools.**

| Tool | What it does |
|---|---|
| `list_dir` | Lists a folder in the workspace. Skips `node_modules`, `.git`, `out`, `dist`, `build`, virtual envs and hidden entries. |
| `read_file` | Reads a file, up to 400 lines by default or a requested range, with line numbers and a content hash. Refuses binary files and files over 2 MB. |
| `grep` | Case-insensitive regex search across the workspace, up to 60 matches by default. |
| `look_at_screen` | Screenshots the display under your cursor and sends it to the reasoning model as an image. The JPEG is stepped down in size and quality until it fits in one data-channel message. |
| `write_note` | Adds a titled Markdown note to the Notes tab. |
| `web_search` | OpenAI's hosted search; it runs on OpenAI's side, so the app never sees it and it does not appear as a source. |

**Safety.** Every path is resolved against the workspace root, and anything that would escape it (`../…`) is refused. Coworker has no tool that writes, deletes or runs anything. Opening VS Code goes through its registered `vscode://` link handler rather than a shell command; if VS Code is not installed, the reference is copied to your clipboard instead.

**Transcript and sources.** The Live API streams transcript text with no turn ids and no "done" events, so a turn is everything one speaker says until the other speaks, and the live marker clears after a short pause. Each lookup is attached to the answer it belongs to. Repeated reads of the same file merge into one chip with overlapping ranges combined, whole-file reads show just the file name, and two files with the same name show their parent folder.

## Project structure

```
src/
  main/
    index.ts          App start-up, windows, global shortcut, settings, IPC handlers,
                      voice instructions, screen capture, open-in-editor
    live.ts           Live session creation and the tool schemas the backend model sees
    tools.ts          WorkspaceGuard (path safety), list_dir, read_file, grep
    investigator.ts   Text investigation loop on the Anthropic API (not yet in the UI)
  preload/
    index.ts          contextBridge API exposed to the UI as window.coworker
  renderer/
    index.html        Main window
    control.html      Floating control bar
    src/
      App.tsx         Layout, setup gate, voice vs settings view
      useVoice.ts     WebRTC session, event handling, tool-call loop, transcript state
      api.ts          Typed wrapper around window.coworker
      components/
        VoiceView.tsx    Orb, controls, Transcript / Notes / Raw tabs
        SourceRow.tsx    Source chips under each answer
        VoiceOrb.tsx     Animated status orb
        SettingsPanel.tsx, Sidebar.tsx, Titlebar.tsx, Markdown.tsx, ErrorBoundary.tsx
        Chat.tsx, Composer.tsx, SourcePicker.tsx   Text-mode UI, not yet wired in
      index.css       Tailwind layers and component styles
  shared/
    types.ts          Types shared by main, preload and UI
PRODUCT.md            Who Coworker is for and the principles behind it
```

## How it was made

**Stack.** Electron 33 with [electron-vite](https://electron-vite.org/) for the build, React 18 and TypeScript for the UI, Tailwind CSS for styling, `electron-store` for settings, `marked` for Markdown, and the OpenAI Live API over WebRTC for voice. The Anthropic SDK powers the text investigation loop.

**Why these choices.**

- *Electron, not a browser extension or IDE plugin:* the point is a companion that sits beside any editor or app, can see the screen, and can stay on top. That needs a desktop app.
- *Voice first:* when you are new to a codebase your eyes are busy reading. Talking keeps them on the code.
- *Read-only tools in the main process:* file access lives behind IPC with one path guard, so the web-facing UI never touches the file system directly and nothing can escape the workspace.
- *Delegated reasoning:* the voice model stays fast and conversational while a stronger model does the multi-step code investigation.
- *Visible sources:* answers about code are only useful if you can check them, so citations are part of the interface, not a footnote. These principles are written down in [PRODUCT.md](PRODUCT.md).

**How it came together.**

1. **First scaffold.** The Electron shell with a frameless main window, the floating control bar and global shortcut, connected-folder workspaces with path safety, the three read-only tools, an Anthropic tool-use loop with streaming text, and customizable personality and verbosity.
2. **Voice.** A move to the OpenAI Live API over WebRTC with delegated reasoning, a live transcript, notes, a Raw event inspector, and an animated orb for session state.
3. **Design review.** A structured critique of the main panel, scored against usability heuristics and checked with an automated detector for contrast and type issues. Its top finding: the product promises traceable answers, but the interface never showed what was read.
4. **Source chips.** Each answer now carries the files and lines it read, opens them in VS Code, and flags answers that came from general knowledge.
5. **Making delegation work.** Session logs showed the backend asking to list the project and then waiting forever: its function calls arrive inside a `response.event` envelope that the app was not reading, and replies used the wrong event name. The app now runs every call, answers each one, and resumes the backend. Voice sessions also gained the `look_at_screen` tool, and transcript turns were reworked for a stream that has no turn ids.

## Troubleshooting

**`Live session failed (401) … Incorrect API key provided: sk-ant-…`**
An Anthropic key is in the OpenAI field. Voice needs an OpenAI key (`sk-proj-…` or `sk-…`). Put the Anthropic key in the *Anthropic API key* field instead.

**`npm error enoent Could not read package.json`**
The command ran outside the project. `cd` into the `CodeCowork` folder first.

**It says it will check something, then goes quiet.**
Open the **Raw** tab and look for a `response.event` containing a `function_call`, followed by outgoing `response.item.create` and `response.create` events. If there are no outgoing events, the call was not answered; `logs/live-events.jsonl` has the full session for debugging.

**It can't see the screen.**
It only looks when asked, so say something like "look at my screen". The screenshot comes from the monitor your mouse is on. If the backend reports an error about the image, the delegated model may not accept image input on your account.

**Clicking a source chip only copies the path.**
VS Code's `vscode://` link handler was not found. Install VS Code, or paste the copied `path:line` into your editor.

**Warnings in the terminal about Content-Security-Policy or `postcss.config.js`.**
Development-only warnings; the app runs normally.

## Limitations and roadmap

- The text investigation mode (Anthropic) is built but not yet reachable from the UI.
- Sources show what was read, not whether the file has changed since; source freshness checks are planned, and the content hash is already recorded.
- Symbol-aware navigation (LSP) is planned.
- Web searches happen on OpenAI's side and do not appear as sources.
- Errors still need clearer, recoverable states, and the main panel is not yet laid out to sit comfortably beside an editor.
- No packaged installer; run it from source.

---

Made by Harsh Singh.
