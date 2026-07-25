export const lighthouseConfig = {
  baseUrl: process.env.LIGHTHOUSE_BASE_URL || 'http://127.0.0.1:15173',
  runs: Number(process.env.LIGHTHOUSE_RUNS || 3),
  pages: [
    { name: 'home', path: '/' },
    { name: 'shop', path: '/shop/' },
    { name: 'product', path: '/products/nova-book-air-14/' },
  ],
  categories: {
    performance: 0.9,
    accessibility: 0.98,
    'best-practices': 0.95,
    seo: 0.98,
  },
  metrics: {
    'first-contentful-paint': 1_800,
    'largest-contentful-paint': 3_000,
    'cumulative-layout-shift': 0.1,
    'total-blocking-time': 300,
    'total-byte-weight': 1_000_000,
  },
};
