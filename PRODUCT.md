# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(Electron desktop app; the UI is web technology rendered in Electron windows, not a native iOS/Android design language.)

## Users

Developers who are new to a codebase: onboarding onto a project or inheriting a repo they did not write. They have the code open and keep asking "what does this do?", "where is X handled?" and "why does this call that?". They want answers without leaving what they are looking at.

## Product Purpose

Coworker is a screen-aware voice coworker. It sits next to whatever the developer is looking at, sees their screen, and investigates a connected workspace folder to answer questions about the code, out loud and in text. Success means a developer gets oriented in an unfamiliar codebase faster, and every answer can be traced to the lines it came from.

## Positioning

- **Voice, hands-free:** you talk to it like a colleague sitting beside you, while your eyes and hands stay on the code.
- **Sees your screen:** it resolves "this function" or "this file" from what is visible right now, in any app, not from one editor's selection.
- **Works outside an IDE:** a floating desktop companion that isn't tied to a particular editor or its chat panel.

## Operating Context

- Runs as a standalone desktop app with a frameless main investigation panel and an always-on-top floating control bar. `Ctrl+Shift+Space` toggles the main window.
- The user connects one workspace folder (any repo). Path safety confines tools to that folder.
- Typical scene: the code is open in another app, the user glances at or speaks to Coworker, and it answers while they keep reading.

## Capabilities and Constraints

- **Text investigation:** an Anthropic tool-use loop with streaming output. It can attach a screenshot of the user's current screen as context and flags differences between what's on screen and what's saved on disk.
- **Voice:** a realtime voice session (OpenAI live/WebRTC) that hands off to a reasoning model with the same workspace tools, plus web search.
- **Tools:** `list_dir`, `read_file` and `grep` (bounded). Answers cite workspace-relative paths and line ranges they actually read, and mark anything unverified or inferred.
- **Settings:** model choices, voice, verbosity (`brief` / `balanced` / `detailed`), whether voice output is on, and personality (presets or free text; default "Warm, concise, and precise. Flag uncertainty plainly.").
- **Other surfaces in code:** chat, composer, sidebar, notes, source picker (screen/region capture), voice orb/voice view and the settings panel.
- **Firm:** Windows-first. Users bring their own Anthropic and OpenAI API keys; there is no hosted account.
- **Current state, not committed:** it only reads code today and never edits or runs it. Whether it stays read-only is undecided.
- **Planned (from the README):** symbol-aware navigation (LSP) and source freshness checks.
- **Terminology:** "workspace" (the connected folder), "investigation" (a tool-driven answer), "personality", "verbosity".

## Brand Commitments

- Name: **Coworker**.
- Voice: answers lead with the conclusion. Short sentences, no preamble or filler, no closing summary, readable when spoken aloud. Uncertainty is stated plainly.

## Evidence on Hand

- No users, testimonials, metrics or launch materials exist. This is a personal project with no pricing or launch planned. Future work must not invent any.
- Brand assets: none beyond the name. There is no logo or icon file in the repo.

## Product Principles

1. **Stay beside the work, not in front of it.** The user's attention belongs on their code; Coworker should be glanceable and interruptible, and speak only when useful.
2. **Every claim is traceable.** Cite what was read; label what was inferred. Grounding is the product, not a footnote.
3. **Speak like a sharp colleague.** Lead with the answer, keep it short, and make it work when heard as well as when read.
4. **The screen is shared context.** "This" should just work; when the screen and the files disagree, say so.
5. **The user owns the setup.** Their keys, their folder, their machine. Nothing is hosted or hidden.
