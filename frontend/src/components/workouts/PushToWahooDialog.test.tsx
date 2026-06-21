import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

// next-intl: translate keys to themselves so we can assert on key names.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

// Control the connection status returned by useSWR per test.
let swrData: { connected: string[] } | undefined
vi.mock('swr', () => ({
  default: () => ({ data: swrData }),
}))

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  fetcher: vi.fn(),
  getTeamSlug: () => 'test-team',
  // setAccessToken is used by the global test setup's beforeEach hook.
  setAccessToken: vi.fn(),
}))

import { PushToWahooDialog } from '@/components/workouts/PushToWahooDialog'

describe('PushToWahooDialog', () => {
  afterEach(() => {
    cleanup()
    swrData = undefined
  })

  it('renders nothing when Wahoo is not connected', () => {
    swrData = { connected: ['strava'] }
    const { container } = render(<PushToWahooDialog workoutId="w1" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the send action when Wahoo is connected', () => {
    swrData = { connected: ['wahoo'] }
    render(<PushToWahooDialog workoutId="w1" />)
    expect(screen.getByText('sendToWahoo')).toBeInTheDocument()
  })
})
