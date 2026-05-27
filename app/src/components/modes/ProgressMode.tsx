import { BookOpen, Award, Target, TrendingUp, Mic, Sparkles } from 'lucide-react'
import type { AppProgress, DeckCard } from '../../data/types'
import { StatCard } from '../ui/StatCard'
import { ProgressBar } from '../ui/ProgressBar'
import { clearProgress } from '../../lib/storage'
import { emptyProgress } from '../../data/types'

interface Props {
  deck: DeckCard[]
  progress: AppProgress
  updateProgress: (u: AppProgress | ((p: AppProgress) => AppProgress)) => void
}

export function ProgressMode({ deck, progress, updateProgress }: Props) {
  const totalCards = deck.length
  const seenCards = Object.keys(progress.cards).length
  const masteredCards = Object.values(progress.cards).filter((c) => c.repetitions >= 3).length
  const accuracy = progress.stats.totalReviews > 0
    ? Math.round((progress.stats.correctReviews / progress.stats.totalReviews) * 100)
    : 0

  const pronAttempts = progress.pronunciationHistory.length
  const pronGood = progress.pronunciationHistory.filter((p) => p.similarity >= 70).length

  const quizCount = progress.quizHistory.length
  const avgQuizScore = quizCount > 0
    ? Math.round(progress.quizHistory.reduce((sum, q) => sum + (q.score / q.total), 0) / quizCount * 100)
    : 0

  const weakCards = Object.entries(progress.cards)
    .filter(([, data]) => data.repetitions < 2)
    .map(([id]) => deck.find((w) => w.id === id))
    .filter((w): w is DeckCard => Boolean(w))
    .slice(0, 5)

  const masteredList = Object.entries(progress.cards)
    .filter(([, data]) => data.repetitions >= 3)
    .map(([id]) => deck.find((w) => w.id === id))
    .filter((w): w is DeckCard => Boolean(w))
    .slice(0, 5)

  const resetAll = async () => {
    if (!window.confirm('Reset all progress? This cannot be undone.')) return
    await clearProgress()
    updateProgress(emptyProgress())
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Cards Seen" value={`${seenCards}/${totalCards}`} icon={BookOpen} color="rose" />
        <StatCard label="Mastered" value={masteredCards} icon={Award} color="emerald" />
        <StatCard label="Accuracy" value={`${accuracy}%`} icon={Target} color="blue" />
        <StatCard label="Reviews" value={progress.stats.totalReviews} icon={TrendingUp} color="violet" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="font-semibold text-slate-900 mb-4">Overall Progress</h3>
        <div className="space-y-3">
          <ProgressBar label="Cards Discovered" value={seenCards} max={totalCards} color="bg-blue-500" />
          <ProgressBar label="Cards Mastered" value={masteredCards} max={totalCards} color="bg-emerald-500" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <Mic className="w-4 h-4 text-purple-600" /> Pronunciation
          </h3>
          <p className="text-3xl font-bold text-slate-900">{pronAttempts}</p>
          <p className="text-sm text-slate-500">attempts · {pronGood} scored 70+</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-600" /> Quizzes
          </h3>
          <p className="text-3xl font-bold text-slate-900">{quizCount}</p>
          <p className="text-sm text-slate-500">taken · avg {avgQuizScore}%</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-amber-200 p-6">
          <h3 className="font-semibold text-amber-900 mb-3">Focus Areas</h3>
          {weakCards.length === 0 ? (
            <p className="text-sm text-slate-500">Start practicing to see your weak words.</p>
          ) : (
            <div className="space-y-2">
              {weakCards.map((card) => (
                <div key={card.id} className="flex justify-between items-center p-2 bg-amber-50 rounded">
                  <span className="font-medium text-slate-900 font-japanese">{card.jp}</span>
                  <span className="text-xs text-slate-500">{card.meaning}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-emerald-200 p-6">
          <h3 className="font-semibold text-emerald-900 mb-3">Mastered Words</h3>
          {masteredList.length === 0 ? (
            <p className="text-sm text-slate-500">Keep practicing to master words.</p>
          ) : (
            <div className="space-y-2">
              {masteredList.map((card) => (
                <div key={card.id} className="flex justify-between items-center p-2 bg-emerald-50 rounded">
                  <span className="font-medium text-slate-900 font-japanese">{card.jp}</span>
                  <span className="text-xs text-slate-500">{card.meaning}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="text-center">
        <button
          onClick={resetAll}
          className="text-sm text-slate-400 hover:text-red-600 underline transition-colors"
        >
          Reset all progress
        </button>
      </div>
    </div>
  )
}
