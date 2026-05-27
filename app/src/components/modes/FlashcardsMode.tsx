import { useState, useEffect, useCallback } from 'react'
import { Volume2 } from 'lucide-react'
import type { AppProgress, DeckCard } from '../../data/types'
import { speak } from '../../lib/speech'
import { sm2, isDue } from '../../lib/sm2'

interface Props {
  deck: DeckCard[]
  progress: AppProgress
  updateProgress: (u: AppProgress | ((p: AppProgress) => AppProgress)) => void
}

export function FlashcardsMode({ deck, progress, updateProgress }: Props) {
  const [showAnswer, setShowAnswer] = useState(false)
  const [currentCard, setCurrentCard] = useState<DeckCard | null>(null)
  const [session, setSession] = useState({ reviewed: 0, correct: 0 })

  const pickNext = useCallback((): DeckCard | null => {
    const due = deck.filter((c) => {
      const p = progress.cards[c.id]
      return p && isDue(p)
    })
    if (due.length > 0) return due[Math.floor(Math.random() * due.length)]
    const unseen = deck.filter((c) => !progress.cards[c.id])
    if (unseen.length > 0) return unseen[0]
    return deck[Math.floor(Math.random() * deck.length)] ?? null
  }, [deck, progress])

  useEffect(() => {
    if (!currentCard) setCurrentCard(pickNext())
  }, [currentCard, pickNext])

  const answer = (quality: number) => {
    if (!currentCard) return
    const existing = progress.cards[currentCard.id]
    const updated = sm2(existing ?? {}, quality)
    updateProgress((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [currentCard.id]: { ...updated, lastReviewed: new Date().toISOString() },
      },
      stats: {
        ...prev.stats,
        totalReviews: prev.stats.totalReviews + 1,
        correctReviews: prev.stats.correctReviews + (quality >= 3 ? 1 : 0),
      },
    }))
    setSession((s) => ({
      reviewed: s.reviewed + 1,
      correct: s.correct + (quality >= 3 ? 1 : 0),
    }))
    setShowAnswer(false)
    setCurrentCard(null)
  }

  if (!currentCard) {
    return <div className="text-center py-12 text-slate-500">Loading…</div>
  }

  const isNew = !progress.cards[currentCard.id]

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 flex justify-between items-center">
        <div className="flex gap-6">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider">Session</p>
            <p className="text-lg font-bold text-slate-900">{session.reviewed} reviewed</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider">Accuracy</p>
            <p className="text-lg font-bold text-emerald-600">
              {session.reviewed > 0 ? Math.round((session.correct / session.reviewed) * 100) : 0}%
            </p>
          </div>
        </div>
        {isNew && (
          <span className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-medium">
            New Card
          </span>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 sm:p-10 min-h-96 flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center">
          <p className="text-sm text-slate-500 mb-2">What does this mean?</p>
          <div className="text-6xl sm:text-7xl font-bold text-slate-900 mb-4 font-japanese text-center">
            {currentCard.jp}
          </div>
          <button
            onClick={() => speak(currentCard.jp)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-lg font-medium transition-colors mb-6"
          >
            <Volume2 className="w-4 h-4" /> Listen
          </button>

          {showAnswer && (
            <div className="text-center animate-fadeIn">
              <div className="text-xl text-slate-600 mb-2">{currentCard.romaji}</div>
              <div className="text-2xl font-semibold text-emerald-700">{currentCard.meaning}</div>
            </div>
          )}
        </div>

        {!showAnswer ? (
          <button
            onClick={() => setShowAnswer(true)}
            className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-medium transition-colors"
          >
            Show Answer
          </button>
        ) : (
          <div>
            <p className="text-sm text-center text-slate-500 mb-3">How well did you remember?</p>
            <div className="grid grid-cols-4 gap-2">
              <RatingButton color="red" label="Again" hint="< 1 day" onClick={() => answer(1)} />
              <RatingButton color="orange" label="Hard" hint="1-2 days" onClick={() => answer(3)} />
              <RatingButton color="blue" label="Good" hint="~3 days" onClick={() => answer(4)} />
              <RatingButton color="emerald" label="Easy" hint="6+ days" onClick={() => answer(5)} />
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 text-center text-xs text-slate-500">
        SM-2 spaced repetition · cards you struggle with appear more often
      </div>
    </div>
  )
}

const COLORS: Record<string, string> = {
  red: 'bg-red-100 hover:bg-red-200 text-red-700',
  orange: 'bg-orange-100 hover:bg-orange-200 text-orange-700',
  blue: 'bg-blue-100 hover:bg-blue-200 text-blue-700',
  emerald: 'bg-emerald-100 hover:bg-emerald-200 text-emerald-700',
}

function RatingButton({ color, label, hint, onClick }: {
  color: keyof typeof COLORS
  label: string
  hint: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`py-3 rounded-lg font-medium text-sm transition-colors ${COLORS[color]}`}
    >
      {label}
      <div className="text-xs opacity-75">{hint}</div>
    </button>
  )
}
