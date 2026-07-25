import { authHeaders, refreshSession } from './session';
export const API = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:18080/api';
let refreshInFlight: ReturnType<typeof refreshSession> | null = null;

async function renewSession() {
  if (!refreshInFlight) {
    refreshInFlight = refreshSession(API).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export const money = (value: unknown) => `${new Intl.NumberFormat('ko-KR').format(Number(value || 0))}원`;
export const categories = [
  { name: '노트북', slug: 'laptop' }, { name: '스마트폰', slug: 'smartphone' },
  { name: '오디오', slug: 'audio' }, { name: '게이밍', slug: 'gaming' },
  { name: '스마트홈', slug: 'smart-home' }, { name: '웨어러블', slug: 'wearable' }, { name: '액세서리', slug: 'accessory' },
];
export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const mutation = !['GET', 'HEAD'].includes(options.method || 'GET');
  const request = () => fetch(`${API}${path}`, { credentials: 'include', ...options, headers: { 'content-type': 'application/json', ...authHeaders({ mutation }), ...(options.headers || {}) } });
  let response = await request();
  if (response.status === 401 && !path.startsWith('/auth/')) {
    const renewed = await renewSession();
    if (renewed) response = await request();
  }
  const text = await response.text(); const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new ApiError(data?.code || 'REQUEST_FAILED', response.status, data);
  return data as T;
}
export const optionText = (values?: Record<string, unknown> | null) => Object.values(values || {}).filter(Boolean).join(' · ');
export const statusLabel: Record<string, string> = { pending: '결제 대기', confirmed: '주문 확정', preparing: '상품 준비', shipped: '배송 중', delivered: '배송 완료', cancelled: '주문 취소' };
