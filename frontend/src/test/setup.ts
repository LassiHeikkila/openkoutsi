import '@testing-library/jest-dom'
import { afterEach, beforeEach, vi } from 'vitest'
import { setAccessToken } from '@/lib/api'

// Provide a reliable localStorage implementation for tests
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string): string | null => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
    get length() { return Object.keys(store).length },
    key: (index: number) => Object.keys(store)[index] ?? null,
  }
})()

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

beforeEach(() => {
  // Reset the in-memory access token between tests
  setAccessToken(null)
  // Clear localStorage (refresh token storage)
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})
