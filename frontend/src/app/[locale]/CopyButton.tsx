'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

export function CopyButton() {
  const t = useTranslations('landing')
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(
      'git clone https://github.com/lassiheikkila/openkoutsi\ndocker compose up -d'
    ).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button className="copy-btn" onClick={handleCopy}>
      {copied ? t('selfhost.copied') : t('selfhost.copy')}
    </button>
  )
}
