type RecogEvent = { results: { 0: { transcript: string }; isFinal: boolean }[] & { length: number } }
type Recog = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((e: RecogEvent) => void) | null
  onerror: ((e: any) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

export class Voice {
  private recog: Recog | null = null
  private listening = false
  private currentUtter: SpeechSynthesisUtterance | null = null

  listenAvailable() { return !!SR }
  speakAvailable() { return typeof window.speechSynthesis !== 'undefined' }

  startListening(onInterim: (text: string) => void, onFinal: (text: string) => void, onEnd: () => void) {
    if (!SR) return false
    if (this.listening) return true
    const r: Recog = new SR()
    r.continuous = false
    r.interimResults = true
    r.lang = 'en-US'
    let final = ''
    r.onresult = (e: RecogEvent) => {
      let interim = ''
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) final += res[0].transcript
        else interim += res[0].transcript
      }
      if (interim) onInterim(interim)
      if (final) onInterim(final)
    }
    r.onerror = () => { /* handled by onend */ }
    r.onend = () => {
      this.listening = false
      this.recog = null
      if (final.trim()) onFinal(final.trim())
      onEnd()
    }
    this.recog = r
    this.listening = true
    r.start()
    return true
  }

  stopListening() {
    this.recog?.stop()
  }

  speak(text: string, onDone?: () => void) {
    if (!this.speakAvailable()) return
    this.stopSpeaking()
    const clean = sanitizeForSpeech(text)
    if (!clean) { onDone?.(); return }
    const u = new SpeechSynthesisUtterance(clean)
    u.rate = 1.05
    u.pitch = 1.0
    const voices = window.speechSynthesis.getVoices()
    const preferred = voices.find(v => /Jenny|Aria|Natural|Online/i.test(v.name) && v.lang.startsWith('en'))
      ?? voices.find(v => v.lang.startsWith('en'))
    if (preferred) u.voice = preferred
    u.onend = () => { if (this.currentUtter === u) this.currentUtter = null; onDone?.() }
    this.currentUtter = u
    window.speechSynthesis.speak(u)
  }

  stopSpeaking() {
    if (this.speakAvailable()) {
      window.speechSynthesis.cancel()
      this.currentUtter = null
    }
  }

  isSpeaking() { return this.speakAvailable() && window.speechSynthesis.speaking }
}

export const voice = new Voice()

function sanitizeForSpeech(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, 'code block')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/#{1,6}\s*/g, '')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\s+/g, ' ')
    .trim()
}
