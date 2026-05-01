import { getRequestConfig } from 'next-intl/server'
import { routing } from './routing'

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale

  if (!locale || !(routing.locales as readonly string[]).includes(locale)) {
    locale = routing.defaultLocale
  }

  return {
    locale,
    messages: {
      common:     (await import(`../../messages/${locale}/common.json`)).default,
      landing:    (await import(`../../messages/${locale}/landing.json`)).default,
      auth:       (await import(`../../messages/${locale}/auth.json`)).default,
      dashboard:  (await import(`../../messages/${locale}/dashboard.json`)).default,
      activities: (await import(`../../messages/${locale}/activities.json`)).default,
      app:        (await import(`../../messages/${locale}/app.json`)).default,
      admin:      (await import(`../../messages/${locale}/admin.json`)).default,
    },
  }
})
