'use client'

import { useToast } from './use-toast'
import { cn } from '@/lib/utils'

export function Toaster() {
  const { toasts, dismiss } = useToast()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'rounded-lg border p-4 shadow-lg bg-background text-foreground flex flex-col gap-1 cursor-pointer',
            t.variant === 'destructive' &&
              'border-destructive bg-destructive text-destructive-foreground',
          )}
          onClick={() => dismiss(t.id)}
        >
          {t.title && <p className="font-semibold text-sm">{t.title}</p>}
          {t.description && <p className="text-sm opacity-90">{t.description}</p>}
        </div>
      ))}
    </div>
  )
}
