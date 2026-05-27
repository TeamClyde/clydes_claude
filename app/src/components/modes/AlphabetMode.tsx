import { useState } from 'react'
import { Volume2, ChevronRight, ChevronLeft } from 'lucide-react'
import { HIRAGANA } from '../../data/hiragana'
import { speak } from '../../lib/speech'

export function AlphabetMode() {
  const [index, setIndex] = useState(0)
  const [showMeaning, setShowMeaning] = useState(false)
  const current = HIRAGANA[index]

  const goto = (i: number) => {
    setIndex(Math.max(0, Math.min(HIRAGANA.length - 1, i)))
    setShowMeaning(false)
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className="text-8xl sm:text-9xl font-bold text-rose-600 mb-2 font-japanese">
            {current.char}
          </div>
          <div className="text-2xl text-slate-600 mb-4">{current.romaji}</div>
          <button
            onClick={() => speak(current.char)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-lg font-medium transition-colors"
          >
            <Volume2 className="w-4 h-4" />
            Listen
          </button>
        </div>

        <div className="bg-gradient-to-r from-slate-50 to-rose-50 rounded-xl p-4 sm:p-6 mb-6">
          <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-4">
            Words using this letter
          </h3>
          <div className="space-y-3">
            {current.words.map((word, idx) => (
              <div key={idx} className="bg-white rounded-lg p-4 border border-slate-200 flex justify-between items-center">
                <div className="min-w-0">
                  <p className="text-xl font-semibold text-slate-900 font-japanese">{word.jp}</p>
                  <p className="text-sm text-slate-500">{word.romaji}</p>
                  <p className={`text-sm mt-1 transition-colors ${showMeaning ? 'text-slate-700' : 'text-slate-300 select-none'}`}>
                    {showMeaning ? word.meaning : '— hidden —'}
                  </p>
                </div>
                <button
                  onClick={() => speak(word.jp)}
                  aria-label={`Listen to ${word.jp}`}
                  className="p-3 hover:bg-rose-50 rounded-lg text-rose-600 transition-colors shrink-0"
                >
                  <Volume2 className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={() => setShowMeaning((s) => !s)}
          className="w-full mb-4 py-3 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium text-slate-700 transition-colors"
        >
          {showMeaning ? 'Hide Meanings' : 'Reveal Meanings'}
        </button>

        <div className="flex gap-3">
          <button
            onClick={() => goto(index - 1)}
            disabled={index === 0}
            className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg font-medium text-slate-700 flex items-center justify-center gap-2 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" /> Previous
          </button>
          <button
            onClick={() => goto(index + 1)}
            disabled={index === HIRAGANA.length - 1}
            className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
          >
            Next <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-6 text-center text-sm text-slate-500">
          Character {index + 1} of {HIRAGANA.length}
        </div>
      </div>
    </div>
  )
}
