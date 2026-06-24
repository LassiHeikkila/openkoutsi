import { describe, expect, it } from 'vitest'

import en from '../../messages/en/app.json'
import fi from '../../messages/fi/app.json'

// Keys consumed by GenerateWorkoutsDialog — guard against a locale drifting.
const PLAN_GENERATE_KEYS = [
  'generateWorkouts',
  'generateWorkoutsDescription',
  'generateWorkoutsNothing',
  'generating',
  'generateWorkoutsError',
  'close',
  'statusGenerated',
  'statusSkipped',
  'statusFailed',
  'unlinkCancel',
] as const

describe('plan generate-workouts i18n', () => {
  it('defines all generate keys in both locales', () => {
    for (const key of PLAN_GENERATE_KEYS) {
      expect(en.plan, `en.plan.${key}`).toHaveProperty(key)
      expect(fi.plan, `fi.plan.${key}`).toHaveProperty(key)
    }
  })
})
