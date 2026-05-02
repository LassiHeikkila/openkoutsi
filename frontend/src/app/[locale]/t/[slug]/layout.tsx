import { TeamProviders } from './providers'

export default async function TeamLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <TeamProviders teamSlug={slug}>{children}</TeamProviders>
}
