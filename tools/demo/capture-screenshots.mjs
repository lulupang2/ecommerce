import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const outputDir = path.join(root, 'docs', 'assets');
const storefrontPort = 19173;
const adminPort = 19174;
const apiBase = 'http://127.0.0.1:18080/api';

const image = color => `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="${color}"/>
      <stop offset="1" stop-color="#020617"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="900" fill="url(#g)"/>
  <circle cx="860" cy="260" r="180" fill="rgba(255,255,255,.18)"/>
  <rect x="260" y="280" width="680" height="320" rx="48" fill="rgba(255,255,255,.20)"/>
  <text x="600" y="455" text-anchor="middle" font-size="72" font-family="Arial" font-weight="800" fill="white">TECHZONE</text>
</svg>`)}`

const product = {
  id: 'prod-nova-book',
  slug: 'nova-book-air-14',
  name: 'NovaBook Air 14 OLED',
  brand: 'NovaTech',
  category: '노트북',
  image: image('#06b6d4'),
  price: 1449000,
  listPrice: 1699000,
  note: '<p>1.1kg 초경량 바디, OLED 디스플레이, 하루 종일 이어지는 배터리를 갖춘 프리미엄 업무용 노트북입니다.</p>',
  images: [
    { id: 'img-1', url: image('#06b6d4'), alt: 'NovaBook 대표 이미지' },
    { id: 'img-2', url: image('#6366f1'), alt: 'NovaBook 측면 이미지' },
    { id: 'img-3', url: image('#14b8a6'), alt: 'NovaBook 사용 이미지' },
  ],
  variants: [
    { id: 'var-1', sku: 'NB-A14-16-512', salePrice: 1449000, listPrice: 1699000, optionValues: { memory: '16GB', storage: '512GB', color: '스페이스 그레이' } },
    { id: 'var-2', sku: 'NB-A14-32-1T', salePrice: 1799000, listPrice: 1999000, optionValues: { memory: '32GB', storage: '1TB', color: '실버' } },
  ],
  specs: [
    { key: '디스플레이', value: '14형 OLED 2.8K 120Hz' },
    { key: '프로세서', value: 'Intel Core Ultra 7' },
    { key: '무게', value: '1.1kg' },
    { key: '배터리', value: '최대 18시간' },
  ],
  reviewSummary: { average: 4.8, count: 128 },
  reviews: [
    { id: 'review-1', userName: '김민준', rating: 5, body: '화면 품질과 휴대성이 좋아서 외근용으로 만족스럽습니다. 포장도 안전했습니다.' },
    { id: 'review-2', userName: '이지은', rating: 4, body: '발열이 적고 배터리가 오래갑니다. 32GB 옵션도 고민할 만합니다.' },
  ],
  questions: [
    { id: 'q-1', title: 'USB-C 충전을 지원하나요?', body: '기존 65W 충전기를 사용할 수 있는지 궁금합니다.', answer: '네, 65W 이상 USB-C PD 충전을 지원합니다.' },
    { id: 'q-2', title: '오늘 주문하면 언제 출고되나요?', body: '서울 기준 배송 일정을 알고 싶습니다.' },
  ],
  related: [],
};
product.related = [
  { id: 'prod-tab', slug: 'pro-tab-11', name: 'ProTab 11', brand: 'NovaTech', image: image('#8b5cf6'), price: 899000 },
  { id: 'prod-buds', slug: 'sound-buds-max', name: 'SoundBuds Max', brand: 'Auralab', image: image('#f43f5e'), price: 249000 },
  { id: 'prod-monitor', slug: 'vision-monitor-32', name: 'Vision Monitor 32', brand: 'ViewMax', image: image('#0f766e'), price: 599000 },
  { id: 'prod-hub', slug: 'desk-hub-pro', name: 'DeskHub Pro', brand: 'ConnectX', image: image('#0284c7'), price: 189000 },
];

const sections = [
  { id: 'sec-hero', type: 'hero', display_order: 1, title: '프리미엄 테크를 스마트하게', subtitle: '노트북부터 오디오까지 엄선된 IT 기기를 만나보세요.', status: 'published', product_count: 4 },
  { id: 'sec-deal', type: 'deal', display_order: 2, title: '오늘의 특가', subtitle: '한정 수량 할인 상품', status: 'published', product_count: 8 },
  { id: 'sec-popular', type: 'popular', display_order: 3, title: '인기 상품', subtitle: '최근 가장 많이 담긴 상품', status: 'published', product_count: 12 },
  { id: 'sec-brand', type: 'brand', display_order: 4, title: '브랜드관', subtitle: '브랜드별 추천 기기', status: 'draft', product_count: 6 },
];

const coupons = [
  { id: 'coupon-1', code: 'TECHZONE10', status: 'active', value: 10, min_order_amount: 300000, max_discount_amount: 50000, redemption_count: 248 },
  { id: 'coupon-2', code: 'LAPTOPWEEK', status: 'active', value: 7, min_order_amount: 1000000, max_discount_amount: 70000, redemption_count: 93 },
  { id: 'coupon-3', code: 'WELCOME5', status: 'inactive', value: 5, min_order_amount: 80000, max_discount_amount: 15000, redemption_count: 412 },
];

const homeResponse = {
  sections: [
    { type: 'hero', title: '프리미엄 테크를 스마트하게', subtitle: '노트북부터 오디오까지 엄선된 IT 기기를 만나보세요.', config: { eyebrow: 'TECHZONE SUPER SALE' }, products: [product] },
    { type: 'deal', title: '오늘의 특가', subtitle: '한정 수량 할인 상품', products: [product, ...product.related] },
    { type: 'popular', title: '인기 상품', subtitle: '최근 가장 많이 담긴 상품', products: product.related },
    { type: 'brand', title: '브랜드관', subtitle: '브랜드별 추천 기기', products: product.related },
    { type: 'editorial', title: '테크 편집부가 고른 오늘의 기기', subtitle: '실사용 후기와 전환 데이터를 기반으로 선별했습니다.', products: product.related },
    { type: 'new', title: '신상품', subtitle: '새로 들어온 기기', products: product.related },
  ],
  brands: [
    { slug: 'novatech', name: 'NovaTech' },
    { slug: 'auralab', name: 'Auralab' },
    { slug: 'viewmax', name: 'ViewMax' },
    { slug: 'connectx', name: 'ConnectX' },
  ],
};

const dashboardResponse = {
  kpis: {
    grossSales: { value: 128400000, change: 18.2 },
    netSales: { value: 115800000, change: 16.9 },
    orders: { value: 286, change: 12.4 },
    averageOrderValue: { value: 449000, change: 7.8 },
    refundRate: { value: 2.1 },
    approvalRate: { value: 98.6 },
    delayedShipments: { value: 4 },
    inventoryRisk: { value: 7 },
  },
  trend: [
    { label: '7/19', revenue: 16400000, orders: 31 },
    { label: '7/20', revenue: 18200000, orders: 35 },
    { label: '7/21', revenue: 21300000, orders: 42 },
    { label: '7/22', revenue: 20400000, orders: 39 },
    { label: '7/23', revenue: 23100000, orders: 45 },
    { label: '7/24', revenue: 25000000, orders: 48 },
    { label: '7/25', revenue: 26800000, orders: 46 },
  ],
  funnel: [
    { status: 'pending', value: 18 },
    { status: 'confirmed', value: 54 },
    { status: 'preparing', value: 41 },
    { status: 'shipped', value: 36 },
    { status: 'delivered', value: 287 },
  ],
  categorySales: [
    { name: '노트북', value: 58 },
    { name: '스마트폰', value: 24 },
    { name: '오디오', value: 12 },
    { name: '액세서리', value: 6 },
  ],
  brandSales: [
    { name: 'NovaTech', value: 44 },
    { name: 'Auralab', value: 21 },
    { name: 'ViewMax', value: 18 },
    { name: 'ConnectX', value: 17 },
  ],
  queues: {
    delayedShipments: 4,
    pendingReturns: 11,
    inventoryRisk: 7,
    openPurchaseOrders: 9,
  },
  recentOrders: [
    { order_id: 'o-1', order_number: 'TZ-2026-74052131', recipient: '김민준', status: 'confirmed', total_amount: 1449000 },
    { order_id: 'o-2', order_number: 'TZ-2026-74052132', recipient: '이서연', status: 'shipped', total_amount: 899000 },
    { order_id: 'o-3', order_number: 'TZ-2026-74052133', recipient: '박지훈', status: 'delivered', total_amount: 249000 },
  ],
  riskInventory: [
    { balance_id: 'b-1', name: 'NovaBook Air 14 OLED', sku: 'NB-A14-16-512', warehouse_name: '중앙창고', available_qty: 3, safety_qty: 12 },
    { balance_id: 'b-2', name: 'SoundBuds Max', sku: 'SB-MAX-BLK', warehouse_name: '중앙창고', available_qty: 5, safety_qty: 10 },
  ],
};

function startNext(app, port) {
  const command = process.platform === 'win32' ? 'cmd.exe' : 'npx';
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', `npx next dev --hostname 127.0.0.1 --port ${port}`]
    : ['next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)];
  const child = spawn(command, args, {
    cwd: path.join(root, 'apps', app),
    env: { ...process.env, NEXT_PUBLIC_API_BASE_URL: apiBase },
    stdio: 'ignore',
  });
  return child;
}

async function waitFor(url, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function mockApi(page) {
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const pathname = url.pathname.replace('/api', '');
    const json = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (pathname === '/products/by-slug/nova-book-air-14') return json(product);
    if (pathname === '/storefront/home') return json(homeResponse);
    if (pathname === '/admin/dashboard') return json(dashboardResponse);
    if (pathname === '/cart/items') return json({ items: [] });
    if (pathname === '/admin/alerts') return json({ items: [{ id: 'alert-1', title: '품절 임박 SKU' }] });
    if (pathname === '/admin/warehouses') return json({ items: [{ id: 'wh-1', name: '중앙창고' }, { id: 'wh-2', name: '반품창고' }] });
    if (pathname === '/storefront/admin/sections') return json({ items: sections });
    if (pathname.startsWith('/storefront/admin/sections/')) return json({ ok: true });
    if (pathname === '/coupons/admin') return json({ items: coupons });

    return json({ items: [] });
  });
}

async function capture() {
  await mkdir(outputDir, { recursive: true });
  const storefront = startNext('storefront', storefrontPort);
  const admin = startNext('admin', adminPort);
  let browser;
  try {
    browser = await chromium.launch();
    await Promise.all([
      waitFor(`http://127.0.0.1:${storefrontPort}/products/nova-book-air-14/`),
      waitFor(`http://127.0.0.1:${adminPort}/admin/storefront/`),
    ]);

    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    await context.addInitScript(() => {
      localStorage.setItem('techzone-session', JSON.stringify({
        user: { id: 'admin-user', name: '관리자', role: 'admin', adminRole: 'super_admin', permissions: [] },
        accessToken: 'demo-token',
        csrfToken: 'demo-csrf',
      }));
    });

    const page = await context.newPage();
    await mockApi(page);

    async function capturePage(url, filename) {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1_000);
      await page.screenshot({ path: path.join(outputDir, filename), fullPage: false });
    }

    await capturePage(
      `http://127.0.0.1:${storefrontPort}/products/nova-book-air-14/`,
      'storefront-product-detail.png',
    );
    await capturePage(`http://127.0.0.1:${storefrontPort}/`, 'storefront-home.png');
    await capturePage(`http://127.0.0.1:${adminPort}/admin/`, 'admin-dashboard.png');
    await capturePage(`http://127.0.0.1:${adminPort}/admin/storefront/`, 'admin-storefront-cms.png');
    await capturePage(`http://127.0.0.1:${adminPort}/admin/coupons/`, 'admin-coupon-ops.png');
  } finally {
    await browser?.close().catch(() => {});
    storefront.kill();
    admin.kill();
  }
}

capture().catch(error => {
  console.error(error);
  process.exit(1);
});
