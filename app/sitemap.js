const slugs = ['nova-book-air-14', 'orbit-pro-x', 'sonic-max-anc', 'arc-mechanical-75', 'home-mini-beam', 'pixel-watch-s', 'dock-one', 'frame-4k'];
export const dynamic = 'force-static';
export default function sitemap() {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:15173';
  return ['', '/shop/', '/cart/', '/orders/', ...slugs.map(slug => `/products/${slug}/`)].map(path => ({ url: `${base}${path}`, lastModified: new Date(), changeFrequency: path.includes('products') ? 'weekly' : 'daily', priority: path === '' ? 1 : .8 }));
}
