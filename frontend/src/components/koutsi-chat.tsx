export const KOUTSI_AVATAR: Record<string, string> = {
  cheer: '/koutsi/koutsi-cheer.svg',
  knowing: '/koutsi/koutsi-knowing.svg',
  neutral: '/koutsi/koutsi-neutral.svg',
  stern: '/koutsi/koutsi-stern.svg',
}

export function parseMoodAndParagraphs(text: string): { mood: string; paragraphs: string[] } {
  const lines = text.split('\n')
  let mood = 'knowing'
  let startIdx = 0
  if (lines[0]?.startsWith('MOOD:')) {
    const candidate = lines[0].slice(5).trim().toLowerCase()
    if (candidate in KOUTSI_AVATAR) mood = candidate
    startIdx = 1
    while (startIdx < lines.length && lines[startIdx].trim() === '') startIdx++
  }
  const rest = lines.slice(startIdx).join('\n')
  return { mood, paragraphs: rest.split(/\n\n+/).map((p) => p.trim()).filter(Boolean) }
}

export function KoutsiAvatar({ mood }: { mood: string }) {
  const src = KOUTSI_AVATAR[mood] ?? KOUTSI_AVATAR.knowing
  return <img src={src} alt="Koutsi" className="w-10 h-10 shrink-0 rounded-full" />
}

export function KoutsiBubble({ text, isPartial }: { text: string; isPartial?: boolean }) {
  return (
    <p className="bg-muted rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm leading-relaxed max-w-prose">
      {text}
      {isPartial && <span className="inline-block w-0.5 h-3.5 ml-0.5 bg-foreground align-middle animate-pulse" />}
    </p>
  )
}
