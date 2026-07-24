export const dynamic = 'force-static';
export default function robots() {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:15173';
  return { rules: { userAgent: '*', allow: '/', disallow: ['/admin/', '/checkout/'] }, sitemap: `${base}/sitemap.xml` };
}
