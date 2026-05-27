import { useState } from 'react'
import { Sparkles, Award, Check, X, Volume2 } from 'lucide-react'
import type { AppProgress, DeckCard } from '../../data/types'
import { generateQuiz, type QuizQuestion } from '../../lib/quiz'
import { speak } from '../../lib/speech'

interface Props {
  deck: DeckCard[]
  progress: AppProgress
  updateProgress: (u: AppProgress | ((p: AppProgress) => AppProgress)) => void
}

export function QuizMode({ deck, progress, updateProgress }: Props) {
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null)
  const [current, setCurrent] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [score, setScore] = useState(0)
  const [done, setDone] = useState(false)
  const [results, setResults] = useState<{ wordId: string; correct: boolean }[]>([])

  const start = () => {
    setQuestions(generateQuiz(deck, progress, 5))
    setCurrent(0)
    setSelected(null)
    setRevealed(false)
    setScore(0)
    setDone(false)
    setResults([])
  }

  const submit = () => {
    if (selected === null || !questions) return
    const q = questions[current]
    const correct = selected === q.correctIndex
    setRevealed(true)
    if (correct) setScore((s) => s + 1)
    setResults((r) => [...r, { wordId: q.wordId, correct }])
  }

  const next = () => {
    if (!questions) return
    if (current < questions.length - 1) {
      setCurrent((c) => c + 1)
      setSelected(null)
      setRevealed(false)
    } else {
      updateProgress((prev) => ({
        ...prev,
        quizHistory: [
          ...prev.quizHistory.slice(-9),
          {
            timestamp: new Date().toISOString(),
            score,
            total: questions.length,
            results,
          },
        ],
      }))
      setDone(true)
    }
  }

  if (!questions) {
    const weakCount = Object.values(progress.cards).filter((c) => c.repetitions < 2).length
    const seenCount = Object.keys(progress.cards).length
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-gradient-to-br from-violet-50 via-white to-rose-50 rounded-2xl shadow-lg border border-violet-200 p-8 sm:p-10 text-center">
          <Sparkles className="w-14 h-14 text-violet-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Adaptive Quiz</h2>
          <p className="text-slate-600 mb-6">
            5 questions, weighted toward words you’ve struggled with. Runs entirely on-device.
          </p>
          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-2xl font-bold text-violet-600">{seenCount}</div>
              <div className="text-slate-500">Words seen</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-amber-600">{weakCount}</div>
              <div className="text-slate-500">Need work</div>
            </div>
          </div>
          <button
            onClick={start}
            className="px-8 py-3 bg-gradient-to-r from-violet-600 to-rose-600 hover:from-violet-700 hover:to-rose-700 text-white rounded-xl font-semibold shadow-lg transition-all"
          >
            Start Quiz
          </button>
        </div>
      </div>
    )
  }

  if (done) {
    const pct = score / questions.length
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-10 text-center">
          <Award className="w-20 h-20 text-amber-500 mx-auto mb-4" />
          <h2 className="text-3xl font-bold text-slate-900 mb-2">Quiz Complete!</h2>
          <p className="text-6xl font-bold text-rose-600 my-6">
            {score}/{questions.length}
          </p>
          <p className="text-slate-600 mb-8">
            {pct === 1 ? 'Perfect — nice work!' :
             pct >= 0.7 ? 'Solid effort. Keep going.' :
             pct >= 0.5 ? 'Decent. Review the missed words.' :
             'Plenty to learn — back to flashcards!'}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setQuestions(null)}
              className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors"
            >
              Back
            </button>
            <button
              onClick={start}
              className="flex-1 py-3 bg-gradient-to-r from-violet-600 to-rose-600 hover:from-violet-700 hover:to-rose-700 text-white rounded-lg font-medium transition-colors"
            >
              New Quiz
            </button>
          </div>
        </div>
      </div>
    )
  }

  const q = questions[current]
  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 sm:p-8">
        <div className="flex justify-between items-center mb-4 text-sm">
          <span className="text-slate-500 font-medium">
            Question {current + 1} of {questions.length}
          </span>
          <span className="text-emerald-600 font-medium">Score: {score}</span>
        </div>
        <div className="w-full bg-slate-100 h-2 rounded-full mb-6">
          <div
            className="bg-gradient-to-r from-violet-600 to-rose-600 h-2 rounded-full transition-all"
            style={{ width: `${((current + 1) / questions.length) * 100}%` }}
          />
        </div>

        <h3 className="text-lg sm:text-xl font-semibold text-slate-900 mb-2">{q.prompt}</h3>
        {q.audio && (
          <button
            onClick={() => speak(q.audio!)}
            className="text-sm text-rose-600 flex items-center gap-1 hover:text-rose-700 mb-6"
          >
            <Volume2 className="w-4 h-4" /> Listen
          </button>
        )}

        <div className="space-y-3 mb-6 mt-4">
          {q.options.map((opt, i) => {
            const isCorrect = i === q.correctIndex
            const isSelected = i === selected
            let bg = 'bg-white border-slate-200 hover:border-rose-300 hover:bg-rose-50'
            if (revealed) {
              if (isCorrect) bg = 'bg-emerald-50 border-emerald-400'
              else if (isSelected) bg = 'bg-red-50 border-red-400'
              else bg = 'bg-slate-50 border-slate-200 opacity-60'
            } else if (isSelected) {
              bg = 'bg-rose-50 border-rose-400'
            }
            return (
              <button
                key={i}
                onClick={() => !revealed && setSelected(i)}
                disabled={revealed}
                className={`w-full p-4 rounded-xl border-2 text-left font-medium transition-all flex items-center gap-3 ${bg}`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  revealed && isCorrect ? 'bg-emerald-500 text-white' :
                  revealed && isSelected && !isCorrect ? 'bg-red-500 text-white' :
                  isSelected ? 'bg-rose-500 text-white' :
                  'bg-slate-100 text-slate-600'
                }`}>
                  {revealed && isCorrect ? <Check className="w-4 h-4" /> :
                   revealed && isSelected && !isCorrect ? <X className="w-4 h-4" /> :
                   String.fromCharCode(65 + i)}
                </div>
                <span className="text-slate-900 flex-1 font-japanese">{opt}</span>
              </button>
            )
          })}
        </div>

        {revealed && (
          <div className={`mb-4 p-4 rounded-lg ${
            selected === q.correctIndex ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'
          }`}>
            <p className="text-sm text-slate-700">
              <strong>{selected === q.correctIndex ? 'Correct! ' : 'Not quite. '}</strong>
              {q.explanation}
            </p>
          </div>
        )}

        {!revealed ? (
          <button
            onClick={submit}
            disabled={selected === null}
            className="w-full py-3 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-lg font-medium transition-colors"
          >
            Submit Answer
          </button>
        ) : (
          <button
            onClick={next}
            className="w-full py-3 bg-gradient-to-r from-violet-600 to-rose-600 hover:from-violet-700 hover:to-rose-700 text-white rounded-lg font-medium transition-colors"
          >
            {current < questions.length - 1 ? 'Next Question' : 'See Results'}
          </button>
        )}
      </div>
    </div>
  )
}
