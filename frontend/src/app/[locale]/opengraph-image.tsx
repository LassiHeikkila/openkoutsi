import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'openkoutsi — open-source cycling training log'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#0a0a0a',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '80px',
        }}
      >
        <div
          style={{
            color: '#22d3ee',
            fontSize: 16,
            marginBottom: 28,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            fontFamily: 'sans-serif',
          }}
        >
          open source · Apache-2.0
        </div>
        <div
          style={{
            color: '#ffffff',
            fontSize: 88,
            fontWeight: 700,
            lineHeight: 1,
            marginBottom: 40,
            fontFamily: 'sans-serif',
          }}
        >
          openkoutsi
        </div>
        <div
          style={{
            color: '#a1a1aa',
            fontSize: 28,
            lineHeight: 1.5,
            maxWidth: 820,
            fontFamily: 'sans-serif',
          }}
        >
          Open-source self-hosted cycling training log. Track power, form, and progression — without
          paywalls.
        </div>
      </div>
    ),
    { ...size },
  )
}
