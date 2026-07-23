export const API = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:18080/api';
export const money = value => `${new Intl.NumberFormat('ko-KR').format(Number(value || 0))}원`;
export const categories = [
  { name: '노트북', slug: 'laptop' }, { name: '스마트폰', slug: 'smartphone' },
  { name: '오디오', slug: 'audio' }, { name: '게이밍', slug: 'gaming' },
  { name: '스마트홈', slug: 'smart-home' }, { name: '웨어러블', slug: 'wearable' }, { name: '액세서리', slug: 'accessory' },
];
export async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
  const text = await response.text(); const data = text ? JSON.parse(text) : null;
  if (!response.ok) { const error = new Error(data?.code || 'REQUEST_FAILED'); error.status = response.status; error.data = data; throw error; }
  return data;
}
export const optionText = values => Object.values(values || {}).filter(Boolean).join(' · ');
export const statusLabel = { pending: '결제 대기', confirmed: '주문 확정', preparing: '상품 준비', shipped: '배송 중', delivered: '배송 완료', cancelled: '주문 취소' };
