// Wrappers around the Web Speech APIs with feature detection and PCM decoding.

export const hasSpeechSynthesis = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window

export const hasSpeechRecognition = () =>
  typeof window !== 'undefined' &&
  ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

export const hasMediaRecorder = () =>
  typeof window !== 'undefined' && 'MediaRecorder' in window

export interface SpeakOptions {
  rate?: number
  pitch?: number
  lang?: string
}

export function speak(text: string, opts: SpeakOptions = {}): void {
  if (!hasSpeechSynthesis()) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = opts.lang ?? 'ja-JP'
  u.rate = opts.rate ?? 0.85
  if (opts.pitch !== undefined) u.pitch = opts.pitch
  window.speechSynthesis.speak(u)
}

export function cancelSpeech(): void {
  if (hasSpeechSynthesis()) window.speechSynthesis.cancel()
}

// --- Recording -------------------------------------------------------------

export interface RecordingResult {
  blob: Blob
  url: string
  samples: Float32Array
  sampleRate: number
  transcript: string
}

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((ev: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}

type RecognitionCtor = new () => SpeechRecognitionLike

function getRecognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor
    webkitSpeechRecognition?: RecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export interface RecorderHandle {
  stop(): Promise<RecordingResult>
  cancel(): void
}

export async function startRecording(opts: { lang?: string } = {}): Promise<RecorderHandle> {
  if (!hasMediaRecorder()) throw new Error('MediaRecorder not supported')

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const recorder = new MediaRecorder(stream)
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data)
  }

  const recognitionCtor = getRecognitionCtor()
  const recognition = recognitionCtor ? new recognitionCtor() : null
  let transcript = ''
  if (recognition) {
    recognition.lang = opts.lang ?? 'ja-JP'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.onresult = (ev) => {
      // The result API: ev.results[0][0].transcript
      const first = ev.results?.[0]?.[0]?.transcript
      if (first) transcript = first
    }
    recognition.onerror = (ev) => {
      console.warn('SpeechRecognition error:', ev.error)
    }
    try {
      recognition.start()
    } catch (e) {
      console.warn('SpeechRecognition start failed:', e)
    }
  }

  recorder.start()

  const cleanup = () => {
    stream.getTracks().forEach((t) => t.stop())
    if (recognition) {
      try { recognition.stop() } catch { /* already stopped */ }
    }
  }

  return {
    cancel() {
      try { recorder.stop() } catch { /* not started */ }
      cleanup()
    },
    stop() {
      return new Promise<RecordingResult>((resolve, reject) => {
        recorder.onstop = async () => {
          cleanup()
          try {
            const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
            const url = URL.createObjectURL(blob)
            const { samples, sampleRate } = await decodeToMono(blob)
            // Give recognition ~300ms to flush its final result event
            await new Promise((r) => setTimeout(r, 300))
            resolve({ blob, url, samples, sampleRate, transcript })
          } catch (e) {
            reject(e)
          }
        }
        try { recorder.stop() } catch (e) { reject(e) }
      })
    },
  }
}

// Decode a recorded blob to mono Float32 PCM.
export async function decodeToMono(blob: Blob): Promise<{ samples: Float32Array; sampleRate: number }> {
  const arr = await blob.arrayBuffer()
  // OfflineAudioContext would let us pick the sample rate; AudioContext is simpler and fine for analysis.
  const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
  const ctx = new AC()
  try {
    const buf = await ctx.decodeAudioData(arr)
    const ch0 = buf.getChannelData(0)
    if (buf.numberOfChannels === 1) {
      return { samples: new Float32Array(ch0), sampleRate: buf.sampleRate }
    }
    // Mix down to mono
    const out = new Float32Array(buf.length)
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const data = buf.getChannelData(c)
      for (let i = 0; i < buf.length; i++) out[i] += data[i]
    }
    for (let i = 0; i < out.length; i++) out[i] /= buf.numberOfChannels
    return { samples: out, sampleRate: buf.sampleRate }
  } finally {
    if (ctx.state !== 'closed') ctx.close().catch(() => {})
  }
}
