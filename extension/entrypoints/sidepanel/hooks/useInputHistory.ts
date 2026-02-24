import { useState, useCallback, useRef, useEffect } from 'react'
import { getUserInputHistory, saveUserInputHistory } from '@/lib/storage'

export function useInputHistory() {
  const [history, setHistory] = useState<string[]>([])
  const cursorRef = useRef(-1)
  const draftRef = useRef('')

  useEffect(() => {
    getUserInputHistory().then(setHistory)
  }, [])

  const addEntry = useCallback((text: string) => {
    if (!text.trim()) return
    setHistory(prev => {
      // Deduplicate adjacent
      const next = prev[prev.length - 1] === text ? prev : [...prev, text]
      saveUserInputHistory(next)
      return next
    })
    cursorRef.current = -1
    draftRef.current = ''
  }, [])

  const navigateUp = useCallback((currentInput: string): string | null => {
    if (history.length === 0) return null
    if (cursorRef.current === -1) {
      draftRef.current = currentInput
      cursorRef.current = history.length - 1
    } else if (cursorRef.current > 0) {
      cursorRef.current--
    } else {
      return null
    }
    return history[cursorRef.current]
  }, [history])

  const navigateDown = useCallback((): string | null => {
    if (cursorRef.current === -1) return null
    if (cursorRef.current < history.length - 1) {
      cursorRef.current++
      return history[cursorRef.current]
    }
    // Back to draft
    cursorRef.current = -1
    return draftRef.current
  }, [history])

  const resetNavigation = useCallback(() => {
    cursorRef.current = -1
    draftRef.current = ''
  }, [])

  return { navigateUp, navigateDown, resetNavigation, addEntry }
}
