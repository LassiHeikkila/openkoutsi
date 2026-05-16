import { useParams } from 'next/navigation'
import { useRouter } from '@/navigation'
import { useAuth } from '@/lib/auth'
import { apiFetch } from '@/lib/api'

export function useCompleteOnboarding() {
  const { athlete, refreshAthlete } = useAuth()
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()

  return async function completeOnboarding() {
    const existing = (athlete?.app_settings ?? {}) as Record<string, unknown>
    await apiFetch('/api/athlete/', {
      method: 'PUT',
      body: JSON.stringify({
        app_settings: { ...existing, onboarding_completed: true },
      }),
    })
    await refreshAthlete()
    router.replace(`/t/${slug}/dashboard`)
  }
}
