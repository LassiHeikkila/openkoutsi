import { describe, expect, it } from 'vitest'
import {
  workoutDate,
  weekKey,
  aggregatePlannedTssByWeek,
  groupPlannedWorkoutsByDate,
  plannedWorkoutStatus,
  workoutFormToPayload,
} from '@/lib/planUtils'
import type { PlannedWorkout, TrainingPlan } from '@/lib/types'

describe('workoutFormToPayload', () => {
  it('coerces filled numeric fields to integers', () => {
    expect(
      workoutFormToPayload({
        workout_type: 'threshold',
        description: '4x8min',
        duration_min: '75',
        target_tss: '90',
      }),
    ).toEqual({
      workout_type: 'threshold',
      description: '4x8min',
      duration_min: 75,
      target_tss: 90,
    })
  })

  it('coerces blank/whitespace values to null', () => {
    expect(
      workoutFormToPayload({
        workout_type: 'recovery',
        description: '   ',
        duration_min: '',
        target_tss: '  ',
      }),
    ).toEqual({
      workout_type: 'recovery',
      description: null,
      duration_min: null,
      target_tss: null,
    })
  })

  it('treats non-numeric duration/tss as null', () => {
    const payload = workoutFormToPayload({
      workout_type: 'long',
      description: 'ride',
      duration_min: 'abc',
      target_tss: '',
    })
    expect(payload.duration_min).toBeNull()
    expect(payload.target_tss).toBeNull()
  })
})

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

function makePlan(overrides: Partial<TrainingPlan> & { workouts?: TrainingPlan['workouts'] }): TrainingPlan {
  return {
    id: 'p1',
    athlete_id: 'a1',
    name: 'Test Plan',
    start_date: '2025-01-06', // Monday
    end_date: null,
    goal: null,
    weeks: 8,
    status: 'active',
    created_at: '2025-01-01T00:00:00Z',
    workouts: [],
    config: null,
    generation_method: null,
    ...overrides,
  }
}

describe('workoutDate', () => {
  const START = '2025-01-06' // Monday Jan 6, 2025

  it('week 1, day 1 → same as start_date', () => {
    const d = workoutDate(START, 1, 1)
    expect(d.toISOString().slice(0, 10)).toBe('2025-01-06')
  })

  it('week 1, day 7 → start_date + 6 (Sunday)', () => {
    const d = workoutDate(START, 1, 7)
    expect(d.toISOString().slice(0, 10)).toBe('2025-01-12')
  })

  it('week 2, day 1 → start_date + 7', () => {
    const d = workoutDate(START, 2, 1)
    expect(d.toISOString().slice(0, 10)).toBe('2025-01-13')
  })

  it('week 3, day 4 (Thursday) → start_date + 17 → 2025-01-23', () => {
    // (3-1)*7 + (4-1) = 17 days: Jan 6 + 17 = Jan 23
    const d = workoutDate(START, 3, 4)
    expect(d.toISOString().slice(0, 10)).toBe('2025-01-23')
  })

  it('week 2, day 3 (Wednesday) → start_date + 9', () => {
    const d = workoutDate(START, 2, 3)
    expect(d.toISOString().slice(0, 10)).toBe('2025-01-15')
  })
})

describe('weekKey', () => {
  it('Monday returns itself', () => {
    expect(weekKey(new Date('2025-01-06'))).toBe('2025-01-06')
  })

  it('Wednesday returns the preceding Monday', () => {
    expect(weekKey(new Date('2025-01-08'))).toBe('2025-01-06')
  })

  it('Sunday returns the preceding Monday', () => {
    expect(weekKey(new Date('2025-01-12'))).toBe('2025-01-06')
  })

  it('cross-month: Sunday March 2 2025 → Monday Feb 24 2025', () => {
    expect(weekKey(new Date('2025-03-02'))).toBe('2025-02-24')
  })
})

describe('aggregatePlannedTssByWeek', () => {
  it('returns empty Map for empty plans array', () => {
    expect(aggregatePlannedTssByWeek([]).size).toBe(0)
  })

  it('skips plans with status !== "active"', () => {
    const plan = makePlan({
      status: 'draft',
      workouts: [{ id: 'w1', plan_id: 'p1', week_number: 1, day_of_week: 1, workout_type: 'easy', description: null, duration_min: 60, target_tss: 50, completed_activity_id: null }],
    })
    expect(aggregatePlannedTssByWeek([plan]).size).toBe(0)
  })

  it('skips workouts with null target_tss', () => {
    const plan = makePlan({
      workouts: [{ id: 'w1', plan_id: 'p1', week_number: 1, day_of_week: 1, workout_type: 'easy', description: null, duration_min: 60, target_tss: null, completed_activity_id: null }],
    })
    expect(aggregatePlannedTssByWeek([plan]).size).toBe(0)
  })

  it('maps a single workout to the correct week key', () => {
    // Plan starts 2025-01-06 (Monday). Week 1 day 1 → 2025-01-06 → weekKey '2025-01-06'
    const plan = makePlan({
      workouts: [{ id: 'w1', plan_id: 'p1', week_number: 1, day_of_week: 1, workout_type: 'easy', description: null, duration_min: 60, target_tss: 80, completed_activity_id: null }],
    })
    const map = aggregatePlannedTssByWeek([plan])
    expect(map.get('2025-01-06')).toBe(80)
  })

  it('sums two workouts in the same week', () => {
    const plan = makePlan({
      workouts: [
        { id: 'w1', plan_id: 'p1', week_number: 1, day_of_week: 1, workout_type: 'easy', description: null, duration_min: 60, target_tss: 60, completed_activity_id: null },
        { id: 'w2', plan_id: 'p1', week_number: 1, day_of_week: 3, workout_type: 'threshold', description: null, duration_min: 90, target_tss: 100, completed_activity_id: null },
      ],
    })
    const map = aggregatePlannedTssByWeek([plan])
    expect(map.get('2025-01-06')).toBe(160)
  })

  it('puts workouts in different weeks into separate keys', () => {
    const plan = makePlan({
      workouts: [
        { id: 'w1', plan_id: 'p1', week_number: 1, day_of_week: 1, workout_type: 'easy', description: null, duration_min: 60, target_tss: 60, completed_activity_id: null },
        { id: 'w2', plan_id: 'p1', week_number: 2, day_of_week: 3, workout_type: 'threshold', description: null, duration_min: 90, target_tss: 100, completed_activity_id: null },
      ],
    })
    const map = aggregatePlannedTssByWeek([plan])
    expect(map.get('2025-01-06')).toBe(60)
    expect(map.get('2025-01-13')).toBe(100)
    expect(map.size).toBe(2)
  })

  it('sums workouts from two active plans falling in the same week', () => {
    const plan1 = makePlan({
      id: 'p1',
      workouts: [{ id: 'w1', plan_id: 'p1', week_number: 1, day_of_week: 2, workout_type: 'easy', description: null, duration_min: 60, target_tss: 50, completed_activity_id: null }],
    })
    const plan2 = makePlan({
      id: 'p2',
      start_date: '2025-01-06',
      workouts: [{ id: 'w2', plan_id: 'p2', week_number: 1, day_of_week: 4, workout_type: 'long', description: null, duration_min: 120, target_tss: 70, completed_activity_id: null }],
    })
    const map = aggregatePlannedTssByWeek([plan1, plan2])
    expect(map.get('2025-01-06')).toBe(120) // 50 + 70
  })
})

describe('groupPlannedWorkoutsByDate', () => {
  it('returns empty map when plan is undefined', () => {
    expect(groupPlannedWorkoutsByDate(undefined).size).toBe(0)
  })

  it('returns empty map when plan is not active', () => {
    const plan = makePlan({
      status: 'archived',
      workouts: [{ id: 'w1', plan_id: 'p1', week_number: 1, day_of_week: 1, workout_type: 'easy', description: null, duration_min: 60, target_tss: 50, completed_activity_id: null }],
    })
    expect(groupPlannedWorkoutsByDate(plan).size).toBe(0)
  })

  it('groups workouts by computed date key', () => {
    const plan = makePlan({
      start_date: '2025-01-06',
      workouts: [
        { id: 'w1', plan_id: 'p1', week_number: 1, day_of_week: 1, workout_type: 'easy', description: null, duration_min: 60, target_tss: 50, completed_activity_id: null },
        { id: 'w2', plan_id: 'p1', week_number: 1, day_of_week: 1, workout_type: 'endurance', description: null, duration_min: 90, target_tss: 80, completed_activity_id: null },
        { id: 'w3', plan_id: 'p1', week_number: 2, day_of_week: 3, workout_type: 'tempo', description: null, duration_min: 45, target_tss: 40, completed_activity_id: null },
      ],
    })

    const map = groupPlannedWorkoutsByDate(plan)
    expect(map.get('2025-01-06')).toHaveLength(2)
    expect(map.get('2025-01-15')).toHaveLength(1)
    expect(map.size).toBe(2)
  })

  it('excludes rest days from the map', () => {
    const plan = makePlan({
      start_date: '2025-01-06',
      workouts: [
        { id: 'w1', plan_id: 'p1', week_number: 1, day_of_week: 1, workout_type: 'rest', description: null, duration_min: null, target_tss: null, completed_activity_id: null },
        { id: 'w2', plan_id: 'p1', week_number: 1, day_of_week: 2, workout_type: 'endurance', description: null, duration_min: 90, target_tss: 80, completed_activity_id: null },
      ],
    })

    const map = groupPlannedWorkoutsByDate(plan)
    expect(map.size).toBe(1)
    expect(map.get('2025-01-06')).toBeUndefined()
    expect(map.get('2025-01-07')).toHaveLength(1)
  })
})

describe('plannedWorkoutStatus', () => {
  it('returns "planned" when neither completed nor skipped', () => {
    expect(plannedWorkoutStatus(makeWorkout())).toBe('planned')
  })

  it('returns "completed" when linked to an activity', () => {
    expect(plannedWorkoutStatus(makeWorkout({ completed_activity_id: 'act-1' }))).toBe('completed')
  })

  it('returns "skipped" when a skip reason is set', () => {
    expect(plannedWorkoutStatus(makeWorkout({ skip_reason: 'illness' }))).toBe('skipped')
  })

  it('treats completion as taking precedence over a skip reason', () => {
    const w = makeWorkout({ completed_activity_id: 'act-1', skip_reason: 'illness' })
    expect(plannedWorkoutStatus(w)).toBe('completed')
  })
})
