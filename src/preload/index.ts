import { contextBridge, ipcRenderer } from 'electron'
import type { Note, Settings, SourceMeta } from '../shared/types'

const api = {
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke('settings:set', patch),
  pickWorkspace: (): Promise<string | null> => ipcRenderer.invoke('workspace:pick'),
  showMain: (): Promise<void> => ipcRenderer.invoke('window:showMain'),
  quit: (): Promise<void> => ipcRenderer.invoke('app:quit'),
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMax: () => ipcRenderer.invoke('window:toggleMax'),
    close: () => ipcRenderer.invoke('window:close')
  },
  openPath: (p: string) => ipcRenderer.invoke('shell:openPath', p),
  openInEditor: (path: string, line?: number): Promise<{ ok: boolean; copied: boolean; error?: string }> =>
    ipcRenderer.invoke('editor:open', { path, line }),
  copyText: (text: string): Promise<void> => ipcRenderer.invoke('clipboard:write', text),
  capture: {
    listSources: (): Promise<{ id: string; name: string; thumbnailDataUrl: string; isScreen: boolean }[]> =>
      ipcRenderer.invoke('capture:sources')
  },
  investigate: {
    start: (payload: { id: string; question: string; history: any[]; imageBase64?: string | null; useScreen?: boolean }) =>
      ipcRenderer.invoke('investigate:start', payload),
    cancel: (id: string) => ipcRenderer.invoke('investigate:cancel', id),
    onEvent: (id: string, cb: (ev: any) => void) => {
      const channel = `investigate:event:${id}`
      const handler = (_e: unknown, ev: any) => cb(ev)
      ipcRenderer.on(channel, handler)
      return () => ipcRenderer.removeListener(channel, handler)
    }
  },
  notes: {
    list: (): Promise<Note[]> => ipcRenderer.invoke('notes:list'),
    remove: (id: string): Promise<void> => ipcRenderer.invoke('notes:delete', id),
    onChanged: (cb: (notes: Note[]) => void) => {
      const handler = (_e: unknown, notes: Note[]) => cb(notes)
      ipcRenderer.on('notes:changed', handler)
      return () => ipcRenderer.removeListener('notes:changed', handler)
    }
  },
  textbar: {
    hide: (): Promise<void> => ipcRenderer.invoke('textbar:hide'),
    resize: (height: number): Promise<void> => ipcRenderer.invoke('textbar:resize', height),
    pickWorkspace: (): Promise<string | null> => ipcRenderer.invoke('textbar:pickWorkspace'),
    onShown: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.on('textbar:shown', handler)
      return () => ipcRenderer.removeListener('textbar:shown', handler)
    },
    onHideRequest: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.on('textbar:hide-request', handler)
      return () => ipcRenderer.removeListener('textbar:hide-request', handler)
    }
  },
  live: {
    createSession: (offerSdp: string): Promise<{ ok: boolean; answerSdp?: string; tools?: any[]; instructions?: string; error?: string }> =>
      ipcRenderer.invoke('live:createSession', { offerSdp }),
    resetLog: () => ipcRenderer.send('live:resetLog'),
    log: (entry: unknown) => ipcRenderer.send('live:log', entry),
    captureScreen: (maxChars: number): Promise<{ ok: boolean; dataUrl?: string; width?: number; height?: number; error?: string }> =>
      ipcRenderer.invoke('live:captureScreen', { maxChars }),
    runTool: (name: string, args: any): Promise<{ ok: boolean; output: string; note?: { id: string; title: string; body: string; createdAt: number } | null; source?: SourceMeta | null; error?: string }> =>
      ipcRenderer.invoke('live:runTool', { name, args })
  }
}

contextBridge.exposeInMainWorld('coworker', api)

export type CoworkerAPI = typeof api
