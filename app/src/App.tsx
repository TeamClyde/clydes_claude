import { useState, useMemo } from 'react'
import {
  Mic, BookOpen, Brain, Sparkles, BarChart3, Award, Loader2,
} from 'lucide-react'
import { HIRAGANA, buildDeck } from './data/hiragana'
import { useProgress } from './hooks/useProgress'
import { AlphabetMode } from './components/modes/AlphabetMode'
import { FlashcardsMode } from './components/modes/FlashcardsMode'
import { PronunciationMode } from './components/modes/PronunciationMode'
import { QuizMode } from './components/modes/QuizMode'
import { ProgressMode } from './components/modes/ProgressMode'

type TabId = 'alphabet' | 'flashcards' | 'pronunciation' | 'quiz' | 'progress'

const TABS: { id: TabId; label: string; icon: typeof Mic }[] = [
  { id: 'alphabet',      label: 'Alphabet',      icon: BookOpen },
  { id: 'flashcards',    label: 'Flashcards',    icon: Brain },
  { id: 'pronunciation', label: 'Pronunciation', icon: Mic },
  { id: 'quiz',          label: 'Quiz',          icon: Sparkles },
  { id: 'progress',      label: 'Progress',      icon: BarChart3 },
]

export default function App() {
  const [active, setActive] = useState<TabId>('alphabet')
  const { progress, updateProgress, loaded } = useProgress()
  const deck = useMemo(() => buildDeck(HIRAGANA), [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-rose-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 font-japanese">
                日本語 <span className="text-rose-600">Learn</span>
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 hidden sm:block">
                Local-first Japanese practice with pitch analysis
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs sm:text-sm bg-rose-50 px-3 py-1.5 rounded-full">
              <Award className="w-4 h-4 text-rose-600" />
              <span className="text-slate-700 font-medium">
                {Object.keys(progress.cards).length} cards · {progress.stats.totalReviews} reviews
              </span>
            </div>
          </div>

          <nav className="flex gap-1 overflow-x-auto -mx-1 px-1">
            {TABS.map((tab) => {
              const Icon = tab.icon
              const isActive = active === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActive(tab.id)}
                  className={`flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg font-medium text-sm transition-all whitespace-nowrap ${
                    isActive ? 'bg-rose-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              )
            })}
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {!loaded ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-rose-600 animate-spin" />
          </div>
        ) : (
          <>
            {active === 'alphabet'      && <AlphabetMode />}
            {active === 'flashcards'    && <FlashcardsMode deck={deck} progress={progress} updateProgress={updateProgress} />}
            {active === 'pronunciation' && <PronunciationMode deck={deck} updateProgress={updateProgress} />}
            {active === 'quiz'          && <QuizMode deck={deck} progress={progress} updateProgress={updateProgress} />}
            {active === 'progress'      && <ProgressMode deck={deck} progress={progress} updateProgress={updateProgress} />}
          </>
        )}
      </main>
    </div>
  )
}
