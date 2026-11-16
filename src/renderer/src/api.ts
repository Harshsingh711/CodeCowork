import type { Settings, SourceMeta } from '../../shared/types'

type API = {
  getSettings: () => Promise<Settings>
  setSettings: (patch: Partial<Settings>) => Promise<Settings>
  pickWorkspace: () => Promise<string | null>
  showMain: () => Promise<void>
  window: { minimize: () => Promise<void>; toggleMax: () => Promise<void>; close: () => Promise<void> }
  openPath: (p: string) => Promise<string>
  openInEditor: (path: string, line?: number) => Promise<{ ok: boolean; copied: boolean; error?: string }>
  copyText: (text: string) => Promise<void>
  capture: {
    listSources: () => Promise<{ id: string; name: string; thumbnailDataUrl: string; isScreen: boolean }[]>
  }
  investigate: {
    start: (p: { id: string; question: string; history: any[]; imageBase64?: string | null }) => Promise<{ ok: boolean; error?: string }>
    cancel: (id: string) => Promise<boolean>
    onEvent: (id: string, cb: (ev: any) => void) => () => void
  }
  live: {
    createSession: (offerSdp: string) => Promise<{ ok: boolean; answerSdp?: string; tools?: any[]; instructions?: string; error?: string }>
    resetLog: () => void
    log: (entry: unknown) => void
    captureScreen: (maxChars: number) => Promise<{ ok: boolean; dataUrl?: string; width?: number; height?: number; error?: string }>
    runTool: (name: string, args: any) => Promise<{ ok: boolean; output: string; note?: { id: string; title: string; body: string; createdAt: number } | null; source?: SourceMeta | null; error?: string }>
  }
}

export const api: API = (window as any).coworker
