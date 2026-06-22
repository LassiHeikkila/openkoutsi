import { describe, expect, it } from 'vitest'

import en from '../../messages/en/app.json'
import fi from '../../messages/fi/app.json'

// Keys consumed by PushWeekToWahooDialog — guard against a locale drifting.
const PLAN_PUSH_KEYS = [
  'pushWeekToWahoo',
  'pushWeekDescription',
  'pushWeekNothing',
  'pushing',
  'pushWeekError',
  'reconnectWahoo',
  'goToProfile',
  'close',
  'statusPushed',
  'statusSkipped',
  'statusFailed',
] as const

describe('plan push-to-wahoo i18n', () => {
  it('defines all push keys in both locales', () => {
    for (const key of PLAN_PUSH_KEYS) {
      expect(en.plan, `en.plan.${key}`).toHaveProperty(key)
      expect(fi.plan, `fi.plan.${key}`).toHaveProperty(key)
    }
  })
})
