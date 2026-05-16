'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useRouter } from '@/navigation'
import { useParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { Step0Consent } from '@/components/onboarding/steps/Step0Consent'
import { Step1Profile } from '@/components/onboarding/steps/Step1Profile'
import { Step2Zones } from '@/components/onboarding/steps/Step2Zones'
import { Step3Providers } from '@/components/onboarding/steps/Step3Providers'
import { Step4Analysis } from '@/components/onboarding/steps/Step4Analysis'
import { Step5Goals } from '@/components/onboarding/steps/Step5Goals'
import { Step6Plan } from '@/components/onboarding/steps/Step6Plan'
import { useCompleteOnboarding } from '@/components/onboarding/useCompleteOnboarding'

export default function OnboardingPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { slug } = useParams<{ slug: string }>()
  const { athlete } = useAuth()
  const completeOnboarding = useCompleteOnboarding()

  const initialStep = parseInt(searchParams.get('step') ?? '0', 10)
  const [step, setStep] = useState(isNaN(initialStep) ? 0 : Math.max(0, Math.min(6, initialStep)))

  useEffect(() => {
    const s = parseInt(searchParams.get('step') ?? '0', 10)
    if (!isNaN(s)) setStep(Math.max(0, Math.min(6, s)))
  }, [searchParams])

  function goTo(n: number) {
    setStep(n)
    router.push(`/t/${slug}/onboarding?step=${n}`)
  }

  function next() {
    if (step < 6) {
      goTo(step + 1)
    } else {
      completeOnboarding()
    }
  }

  function back() {
    if (step > 1) goTo(step - 1)
  }

  function skip() {
    next()
  }

  // Redirect if already completed onboarding
  useEffect(() => {
    if (athlete) {
      const done = (athlete.app_settings as Record<string, unknown>)?.onboarding_completed
      if (done) router.replace(`/t/${slug}/dashboard`)
    }
  }, [athlete, router, slug])

  return (
    <>
      {step === 0 && <Step0Consent onAccepted={() => goTo(1)} />}
      {step === 1 && <Step1Profile onNext={next} onSkip={skip} />}
      {step === 2 && <Step2Zones onNext={next} onBack={back} onSkip={skip} />}
      {step === 3 && <Step3Providers onNext={next} onBack={back} onSkip={skip} />}
      {step === 4 && <Step4Analysis onNext={next} onBack={back} onSkip={skip} />}
      {step === 5 && <Step5Goals onNext={next} onBack={back} onSkip={skip} />}
      {step === 6 && <Step6Plan onNext={completeOnboarding} onBack={back} onSkip={completeOnboarding} />}
    </>
  )
}
