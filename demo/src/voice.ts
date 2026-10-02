// Voice loop on free browser APIs: SpeechRecognition in, speechSynthesis
// out. No keys, no vendors. Unsupported browsers get a clear message.

export function voiceSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) != null
  )
}

export function listenOnce(timeoutMs = 12_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const Ctor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!Ctor) {
      reject(new Error("Voice input is not supported here."))
      return
    }
    const rec = new Ctor()
    rec.lang = "en-US"
    rec.interimResults = false
    rec.maxAlternatives = 1
    let done = false
    const finish = (fn: () => void) => {
      if (!done) {
        done = true
        try {
          rec.stop()
        } catch {
          // ignore
        }
        fn()
      }
    }
    const timer = window.setTimeout(() => finish(() => reject(new Error("Heard nothing. Try again."))), timeoutMs)
    rec.onresult = (e: any) => {
      window.clearTimeout(timer)
      const text = e?.results?.[0]?.[0]?.transcript ?? ""
      finish(() => (text.trim() ? resolve(text.trim()) : reject(new Error("Heard nothing. Try again."))))
    }
    rec.onerror = () => {
      window.clearTimeout(timer)
      finish(() => reject(new Error("Mic blocked. Allow access in settings.")))
    }
    try {
      rec.start()
    } catch {
      window.clearTimeout(timer)
      finish(() => reject(new Error("Mic busy. Try again.")))
    }
  })
}

export function speak(text: string): void {
  try {
    if (!("speechSynthesis" in window)) return
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(text.slice(0, 280))
    utter.rate = 1.05
    window.speechSynthesis.speak(utter)
  } catch {
    // Silent. Voice is enhancement, never the path.
  }
}
