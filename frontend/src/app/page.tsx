// This file should never be reached — middleware redirects / to /[locale]
import { redirect } from 'next/navigation'

export default function RootPage() {
  redirect('/en')
}
