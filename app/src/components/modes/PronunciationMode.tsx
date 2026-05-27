import { useState, useEffect, useRef } from 'react'
import {
  Mic, Square, Play, Headphones, ChevronRight, Loader2, Save, RotateCcw,
} from 'lucide-react'
import type { AppProgress, DeckCard } from '../../data/types'
import {
  startRecording, speak,
  hasSpeechRecognition, hasMediaRecorder,
  type RecorderHandle, type RecordingResult,
} from '../../lib/speech'
import { extractPitch, trimSilence, normalizedSemitones, type PitchCurve } from '../../lib/audio/pitch'
import { similarityScore } from '../../lib/audio/dtw'
import { PitchChart } from '../ui/PitchChart'

interface Props {
  deck: DeckCard[]
  updateProgress: (u: AppProgress | ((p: AppProgress) => AppProgress)) => void
}

interface Take {
  url: string
  transcript: string
  curve: PitchCurve
}

export function PronunciationMode({ deck, updateProgress }: Props) {
  const [wordIndex, setWordIndex] = useState(0)
  const [supported, setSupported] = useState(true)
  const [isRecording, setIsRecording] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reference, setReference] = useState<Take | null>(null)
  const [attempt, setAttempt] = useState<Take | null>(null)
  const [recordingTarget, setRecordingTarget] = useState<'reference' | 'attempt'>('reference')
  const handleRef = useRef<RecorderHandle | null>(null)

  const currentWord = deck[wordIndex % deck.length]

  useEffect(() => {
    setSupported(hasMediaRecorder())
    if (!hasSpeechRecognition()) {
      // Recognition is optional; we still get pitch analysis without it.
      console.info('SpeechRecognition unavailable; transcripts will be empty.')
    }
  }, [])

  useEffect(() => {
    // Reset takes when switching words
    setReference(null)
    setAttempt(null)
    setError(null)
  }, [wordIndex])

  const buildTake = (result: RecordingResult): Take => {
    const raw = extractPitch(result.samples, result.sampleRate)
    return {
      url: result.url,
      transcript: result.transcript,
      curve: trimSilence(raw),
    }
  }

  const startRec = async (target: 'reference' | 'attempt') => {
    setError(null)
    setRecordingTarget(target)
    try {
      handleRef.current = await startRecording()
      setIsRecording(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not access microphone')
    }
  }

  const stopRec = async () => {
    if (!handleRef.current) return
    setProcessing(true)
    setIsRecording(false)
    try {
      const result = await handleRef.current.stop()
      const take = buildTake(result)
      if (recordingTarget === 'reference') setReference(take)
      else setAttempt(take)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Recording failed')
    } finally {
      handleRef.current = null
      setProcessing(false)
    }
  }

  const score = reference && attempt
    ? similarityScore(normalizedSemitones(reference.curve), normalizedSemitones(attempt.curve))
    : null

  useEffect(() => {
    if (score === null || !attempt) return
    updateProgress((prev) => ({
      ...prev,
      pronunciationHistory: [
        ...prev.pronunciationHistory.slice(-49),
        {
          word: currentWord.jp,
          target: currentWord.jp,
          transcribed: attempt.transcript,
          similarity: score,
          timestamp: new Date().toISOString(),
        },
      ],
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score])

  const nextWord = () => setWordIndex((i) => i + 1)

  if (!supported) {
    return (
      <div className="max-w-2xl mx-auto bg-amber-50 border border-amber-200 rounded-xl p-6">
        <h3 className="font-semibold text-amber-900 mb-2">Browser Not Supported</h3>
        <p className="text-amber-800 text-sm">
          Pronunciation practice needs MediaRecorder support. Try a recent Chrome, Edge, or Safari.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 sm:p-8">
        <div className="text-center mb-6">
          <p className="text-sm text-slate-500 mb-2">Say this word:</p>
          <div className="text-5xl sm:text-6xl font-bold text-slate-900 mb-3 font-japanese">
            {currentWord.jp}
          </div>
          <div className="text-lg text-slate-600 mb-1">{currentWord.romaji}</div>
          <div className="text-sm text-slate-500">“{currentWord.meaning}”</div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <button
            onClick={() => speak(currentWord.jp)}
            className="flex items-center justify-center gap-2 py-3 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-xl font-medium transition-colors"
          >
            <Headphones className="w-5 h-5" />
            Hear Native
          </button>
          <button
            onClick={() => attempt && new Audio(attempt.url).play()}
            disabled={!attempt}
            className="flex items-center justify-center gap-2 py-3 bg-purple-100 hover:bg-purple-200 disabled:opacity-40 text-purple-700 rounded-xl font-medium transition-colors"
          >
            <Play className="w-5 h-5" />
            Hear Attempt
          </button>
        </div>

        {!isRecording ? (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => startRec('reference')}
              disabled={processing}
              className="py-4 rounded-xl font-semibold flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white transition-colors"
            >
              {reference ? <RotateCcw className="w-5 h-5" /> : <Save className="w-5 h-5" />}
              {reference ? 'Re-record Reference' : 'Record Reference'}
            </button>
            <button
              onClick={() => startRec('attempt')}
              disabled={processing}
              className="py-4 rounded-xl font-semibold flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white transition-colors shadow"
            >
              <Mic className="w-5 h-5" />
              Record Attempt
            </button>
          </div>
        ) : (
          <button
            onClick={stopRec}
            className="w-full py-5 rounded-xl font-semibold text-lg flex items-center justify-center gap-3 bg-red-600 hover:bg-red-700 text-white animate-pulse"
          >
            <Square className="w-6 h-6" />
            Stop {recordingTarget === 'reference' ? 'Reference' : 'Attempt'}
          </button>
        )}

        {processing && (
          <div className="mt-4 flex items-center justify-center gap-2 text-slate-600">
            <Loader2 className="w-4 h-4 animate-spin" /> Analyzing pitch…
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
            {error}
          </div>
        )}

        {(reference || attempt) && (
          <div className="mt-6">
            <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
              Pitch contour
            </h3>
            <PitchChart user={attempt?.curve} reference={reference?.curve} />
            {score !== null && (
              <div className="mt-4 p-4 bg-gradient-to-br from-violet-50 to-rose-50 border border-violet-200 rounded-xl text-center">
                <p className="text-xs uppercase tracking-wider text-slate-500">Pitch similarity</p>
                <p className={`text-4xl font-bold ${
                  score >= 80 ? 'text-emerald-600' :
                  score >= 60 ? 'text-blue-600' :
                  score >= 40 ? 'text-amber-600' : 'text-rose-600'
                }`}>{score}</p>
                <p className="text-xs text-slate-500 mt-1">
                  DTW over normalized semitones · 100 = perfect shape match
                </p>
              </div>
            )}
            {(reference?.transcript || attempt?.transcript) && (
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                {reference?.transcript && (
                  <div className="p-2 bg-slate-50 rounded">
                    <span className="text-xs text-slate-500">Reference heard: </span>
                    <span className="font-japanese">{reference.transcript}</span>
                  </div>
                )}
                {attempt?.transcript && (
                  <div className="p-2 bg-slate-50 rounded">
                    <span className="text-xs text-slate-500">Attempt heard: </span>
                    <span className="font-japanese">{attempt.transcript}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <button
          onClick={nextWord}
          className="w-full mt-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
        >
          Next Word <ChevronRight className="w-5 h-5" />
        </button>

        <p className="mt-4 text-xs text-slate-500 text-center">
          Tip: record your best attempt as <strong>Reference</strong>, then practice against it. All analysis runs locally — no audio leaves your device.
        </p>
      </div>
    </div>
  )
}
