import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? ''
  const result: MetadataRoute.Robots = {
    rules: [
      {
        userAgent: '*',
        allow: ['/en', '/fi'],
        disallow: ['/', '/setup', '/superadmin'],
      },
    ],
  }
  if (base) {
    result.sitemap = `${base}/sitemap.xml`
  }
  return result
}
