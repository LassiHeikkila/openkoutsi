'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

const THEMES = [
  { id: 'light',           label: 'Blue',     color: 'oklch(0.53 0.24 258)' },
  { id: 'light-warm',      label: 'Warm',     color: 'oklch(0.6 0.22 50)' },
  { id: 'light-sage',      label: 'Sage',     color: 'oklch(0.5 0.2 152)' },
  { id: 'light-lavender',  label: 'Lavender', color: 'oklch(0.53 0.26 278)' },
] as const

interface ThemePickerProps {
  variant?: 'landing' | 'app'
}

export function ThemePicker({ variant = 'app' }: ThemePickerProps) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  if (!mounted) return null

  if (variant === 'landing') {
    return (
      <div className="theme-picker">
        {THEMES.map(t => (
          <button
            key={t.id}
            title={t.label}
            onClick={() => setTheme(t.id)}
            className={cn('theme-swatch', theme === t.id && 'active')}
            style={{ background: t.color }}
            aria-label={`${t.label} theme`}
            aria-pressed={theme === t.id}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      {THEMES.map(t => (
        <button
          key={t.id}
          title={t.label}
          onClick={() => setTheme(t.id)}
          style={{ background: t.color }}
          className={cn(
            'w-3.5 h-3.5 rounded-full cursor-pointer border-2 border-transparent transition-transform hover:scale-125 focus-visible:outline-none',
            theme === t.id && 'ring-2 ring-offset-1 ring-offset-background ring-foreground/40',
          )}
          aria-label={`${t.label} theme`}
          aria-pressed={theme === t.id}
        />
      ))}
    </div>
  )
}
