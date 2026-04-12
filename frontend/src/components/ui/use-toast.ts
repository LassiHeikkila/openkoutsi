// Simplified global toast hook — no external dependency
import { useState, useEffect, useCallback } from 'react'

export interface Toast {
  id: string
  title?: string
  description?: string
  variant?: 'default' | 'destructive'
}

let toastListeners: Array<(toasts: Toast[]) => void> = []
let toastList: Toast[] = []

function notify() {
  toastListeners.forEach((fn) => fn([...toastList]))
}

export function toast(options: Omit<Toast, 'id'>) {
  const id = Math.random().toString(36).slice(2)
  toastList = [...toastList, { id, ...options }]
  notify()
  setTimeout(() => {
    toastList = toastList.filter((x) => x.id !== id)
    notify()
  }, 4000)
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>(toastList)

  useEffect(() => {
    const handler = (updated: Toast[]) => setToasts(updated)
    toastListeners.push(handler)
    return () => {
      toastListeners = toastListeners.filter((fn) => fn !== handler)
    }
  }, [])

  const dismiss = useCallback((id: string) => {
    toastList = toastList.filter((t) => t.id !== id)
    notify()
  }, [])

  return { toasts, toast, dismiss }
}
