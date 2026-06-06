import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import appMessages from '../../messages/en/app.json'
import { WorkoutActionsPanel } from '@/components/plan/WorkoutActionsPanel'
import { apiFetch } from '@/lib/api'
import type { PlannedWorkout } from '@/lib/types'

// JSX inside vi.mock factories is mis-parsed by the oxc/rolldown transform used here,
// so the mocks and rendering use React.createElement instead of JSX.

// Preserve the real module (setup.ts uses setAccessToken) but stub the network call.
vi.mock('@/lib/api', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/api')>()
  return { ...actual, apiFetch: vi.fn() }
})

vi.mock('@/components/ui/use-toast', () => ({ toast: vi.fn() }))

// Radix Select relies on pointer APIs unavailable in jsdom; swap for a native select.
vi.mock('@/components/ui/select', async () => {
  const { createElement: h } = await import('react')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Select = ({ value, onValueChange, children }: any) =>
    h(
      'select',
      {
        'data-testid': 'select',
        value,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onChange: (e: any) => onValueChange(e.target.value),
      },
      h('option', { value: '' }),
      children,
    )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SelectContent = ({ children }: any) => children
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SelectItem = ({ value, children }: any) => h('option', { value }, children)
  return {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger: () => null,
    SelectValue: () => null,
  }
})

const mockedFetch = vi.mocked(apiFetch)

function makeWorkout(overrides: Partial<PlannedWorkout> = {}): PlannedWorkout {
  return {
    id: 'w1',
    plan_id: 'p1',
    week_number: 1,
    day_of_week: 1,
    workout_type: 'endurance',
    description: null,
    duration_min: 60,
    target_tss: 50,
    completed_activity_id: null,
    skip_reason: null,
    ...overrides,
  }
}

function renderPanel(props: Parameters<typeof WorkoutActionsPanel>[0]) {
  return render(
    createElement(
      NextIntlClientProvider,
      { locale: 'en', messages: { app: appMessages } },
      createElement(WorkoutActionsPanel, props),
    ),
  )
}

beforeEach(() => {
  mockedFetch.mockReset()
})

describe('WorkoutActionsPanel', () => {
  it('marks a workout as completed by linking the chosen activity', async () => {
    mockedFetch.mockImplementation(async (url: string) => {
      if (url.includes('/api/activities/')) {
        return {
          items: [{ id: 'act-1', name: 'Morning Run', sport_type: 'run', duration_s: 3600, tss: 50 }],
          total: 1,
        }
      }
      return {}
    })
    const onWorkoutUpdated = vi.fn()
    renderPanel({ workout: makeWorkout(), date: '2025-01-06', onWorkoutUpdated })

    fireEvent.click(screen.getByText('Mark as completed…'))

    await waitFor(() =>
      expect(mockedFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/activities/?start=2025-01-06&end=2025-01-06'),
      ),
    )

    fireEvent.change(await screen.findByTestId('select'), { target: { value: 'act-1' } })
    fireEvent.click(screen.getByText('Link'))

    await waitFor(() =>
      expect(mockedFetch).toHaveBeenCalledWith(
        '/api/plans/p1/workouts/w1/link',
        expect.objectContaining({ method: 'PUT', body: JSON.stringify({ activity_id: 'act-1' }) }),
      ),
    )
    expect(onWorkoutUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'w1', completed_activity_id: 'act-1' }),
    )
  })

  it('marks a workout as skipped with the selected reason', async () => {
    mockedFetch.mockResolvedValue({})
    const onWorkoutUpdated = vi.fn()
    renderPanel({ workout: makeWorkout(), date: '2025-01-06', onWorkoutUpdated })

    fireEvent.click(screen.getByText('Mark as skipped…'))
    fireEvent.change(await screen.findByTestId('select'), { target: { value: 'illness' } })
    fireEvent.click(screen.getByText('Mark as skipped'))

    await waitFor(() =>
      expect(mockedFetch).toHaveBeenCalledWith(
        '/api/plans/p1/workouts/w1/skip',
        expect.objectContaining({ method: 'PUT', body: JSON.stringify({ reason: 'illness' }) }),
      ),
    )
    expect(onWorkoutUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'w1', skip_reason: 'illness' }),
    )
  })

  it('shows action buttons only for a pending workout', () => {
    const { rerender } = renderPanel({
      workout: makeWorkout({ completed_activity_id: 'act-1' }),
      date: '2025-01-06',
      onWorkoutUpdated: vi.fn(),
    })
    expect(screen.queryByText('Mark as completed…')).toBeNull()
    expect(screen.queryByText('Mark as skipped…')).toBeNull()

    rerender(
      createElement(
        NextIntlClientProvider,
        { locale: 'en', messages: { app: appMessages } },
        createElement(WorkoutActionsPanel, {
          workout: makeWorkout(),
          date: '2025-01-06',
          onWorkoutUpdated: vi.fn(),
        }),
      ),
    )
    expect(screen.getByText('Mark as completed…')).toBeTruthy()
    expect(screen.getByText('Mark as skipped…')).toBeTruthy()
  })
})
