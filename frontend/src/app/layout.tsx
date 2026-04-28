import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/logo-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/logo-256.png', sizes: '256x256', type: 'image/png' },
    ],
    apple: { url: '/logo-256.png' },
  },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return children
}
