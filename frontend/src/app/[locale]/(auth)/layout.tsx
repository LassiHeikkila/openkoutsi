import type { ReactNode } from 'react'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/40 p-4 gap-6">
      <img src="/logo.svg" alt="openkoutsi" className="h-14 w-14" />
      {children}
    </div>
  )
}
