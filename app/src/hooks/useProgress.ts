import { useState, useEffect, useCallback } from 'react'
import type { AppProgress } from '../data/types'
import { emptyProgress } from '../data/types'
import { loadProgress, saveProgress } from '../lib/storage'

type Updater = AppProgress | ((p: AppProgress) => AppProgress)

export function useProgress() {
  const [progress, setProgress] = useState<AppProgress>(emptyProgress)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    loadProgress().then((p) => {
      setProgress(p)
      setLoaded(true)
    })
  }, [])

  const updateProgress = useCallback((updater: Updater) => {
    setProgress((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      void saveProgress(next)
      return next
    })
  }, [])

  return { progress, updateProgress, loaded }
}
