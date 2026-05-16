'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import type { ReactNode } from 'react'

const TOTAL_STEPS = 7 // steps 0–6; step 0 is consent (no skip/back)

interface WizardShellProps {
  step: number
  title: string
  children: ReactNode
  onNext?: () => void
  onBack?: () => void
  onSkip?: () => void
  onSkipAll?: () => void
  nextLabel?: string
  nextDisabled?: boolean
  saving?: boolean
  hideNav?: boolean // used for step 0 (consent handles its own buttons)
}

export function WizardShell({
  step,
  title,
  children,
  onNext,
  onBack,
  onSkip,
  onSkipAll,
  nextLabel,
  nextDisabled,
  saving,
  hideNav,
}: WizardShellProps) {
  const t = useTranslations('onboarding')

  const displayStep = step + 1 // step 0 shown as "Step 1"
  const displayTotal = TOTAL_STEPS

  return (
    <Card className="w-full shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-muted-foreground">
            {t('wizard.stepOf', { current: displayStep, total: displayTotal })}
          </span>
          {step > 0 && onSkipAll && (
            <button
              type="button"
              onClick={onSkipAll}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              {t('wizard.skipAll')}
            </button>
          )}
        </div>

        {/* Progress bar */}
        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
          />
        </div>

        <CardTitle className="mt-4 text-xl">{title}</CardTitle>
      </CardHeader>

      <CardContent>{children}</CardContent>

      {!hideNav && (
        <CardFooter className="flex flex-col gap-2 pt-0">
          <div className="flex w-full gap-2">
            {step > 0 && onBack && (
              <Button type="button" variant="outline" onClick={onBack} className="flex-none">
                {t('wizard.back')}
              </Button>
            )}
            <div className="flex-1" />
            {onSkip && step > 0 && (
              <Button type="button" variant="ghost" onClick={onSkip}>
                {t('wizard.skipStep')}
              </Button>
            )}
            {onNext && (
              <Button type="button" onClick={onNext} disabled={nextDisabled || saving}>
                {saving ? '…' : (nextLabel ?? (step === TOTAL_STEPS - 1 ? t('wizard.finish') : t('wizard.next')))}
              </Button>
            )}
          </div>
        </CardFooter>
      )}
    </Card>
  )
}
