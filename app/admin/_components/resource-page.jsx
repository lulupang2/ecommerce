'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createColumnHelper } from '@tanstack/react-table';
import { ArrowRight, Boxes, CalendarDays, Plus, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authHeaders, readSession } from '@/lib/session';
import ServerDataTable, { SelectColumn } from './server-data-table';
import ActionDialog from './action-dialog';

const API = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:18080/api';
const h = createColumnHelper();
const money = value => `${new Intl.NumberFormat('ko-KR').format(Number(value || 0))}원`;
const date = value => value ? new Date(value).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
const labels = {
  pending: '결제 대기', confirmed: '주문 확정', preparing: '상품 준비', shipped: '배송 중', delivered: '배송 완료', cancelled: '취소',
  published: '판매 중', draft: '작성 중', hidden: '숨김', archived: '보관',
  ready: '출고 대기', packed: '포장 완료',
  requested: '접수', approved: '승인', received: '검수 완료', refunded: '환불 완료', rejected: '반려',
  partially_received: '부분 입고',
  active: '활성', inactive: '비활성',
};
const configs = {
  orders: { title: '주문 관리', eyebrow: 'ORDER MANAGEMENT', description: '주문·결제·출고 상태를 확인하고 처리합니다.', endpoint: 'orders', id: 'order_id', statusOptions: ['pending', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled'], defaultSort: 'created_at',
    columns: [
      ['order_number', '주문번호'], ['recipient', '고객'], ['status', '주문 상태', 'status'], ['payment_status', '결제', 'status'], ['fulfillment_status', '출고', 'status'], ['total_amount', '결제금액', 'money'], ['created_at', '주문일시', 'date'],
    ], action: { label: '상태 변경', type: 'order' } },
  shipments: { title: '배송 관리', eyebrow: 'FULFILLMENT', description: '출고 준비부터 송장·배송 완료까지 추적합니다.', endpoint: 'shipments', id: 'shipment_id', statusOptions: ['ready', 'packed', 'shipped', 'delivered', 'cancelled'], defaultSort: 'created_at',
    columns: [['shipment_number', '출고번호'], ['order_number', '주문번호'], ['recipient', '수령인'], ['carrier', '택배사'], ['tracking_number', '송장번호'], ['status', '배송 상태', 'status'], ['created_at', '생성일', 'date']], action: { label: '배송 처리', type: 'shipment' } },
  returns: { title: '반품·환불', eyebrow: 'RETURNS & REFUNDS', description: '반품 승인, 검수 입고, 환불을 단계별로 처리합니다.', endpoint: 'returns', id: 'return_id', statusOptions: ['requested', 'approved', 'received', 'refunded', 'rejected'], defaultSort: 'requested_at',
    columns: [['return_number', '반품번호'], ['order_number', '주문번호'], ['recipient', '고객'], ['reason', '사유'], ['refund_amount', '환불 예정액', 'money'], ['status', '처리 상태', 'status'], ['requested_at', '접수일', 'date']], action: { label: '반품 처리', type: 'return' } },
  products: { title: '상품 관리', eyebrow: 'PRODUCT INFORMATION', description: '상품, SKU, 모델번호, 가격과 판매 상태를 관리합니다.', endpoint: 'products', id: 'product_id', statusOptions: ['draft', 'published', 'hidden', 'archived'], defaultSort: 'created_at', primaryAction: { href: '/admin/products/', label: '상품 등록' },
    columns: [['sku', 'SKU'], ['name', '상품명'], ['brand', '브랜드'], ['category', '카테고리'], ['model_number', '모델번호'], ['price', '판매가', 'money'], ['status', '상태', 'status'], ['created_at', '등록일', 'date']], action: { label: '수정', type: 'product' } },
  inventory: { title: '재고 관리', eyebrow: 'WAREHOUSE INVENTORY', description: '창고별 가용·예약·불량·입고예정 재고를 관리합니다.', endpoint: 'inventory', id: 'balance_id', statusOptions: [], defaultSort: 'updated_at',
    columns: [['sku', 'SKU'], ['name', '상품명'], ['warehouse_name', '창고'], ['available_qty', '가용'], ['reserved_qty', '예약'], ['damaged_qty', '불량'], ['incoming_qty', '입고예정'], ['safety_qty', '안전재고'], ['updated_at', '갱신일', 'date']], action: { label: '재고 조정', type: 'inventory' } },
  procurement: { title: '공급사·발주', eyebrow: 'PROCUREMENT', description: '공급사 발주와 입고 진행률을 관리합니다.', endpoint: 'purchase-orders', id: 'purchase_order_id', statusOptions: ['draft', 'approved', 'partially_received', 'received', 'cancelled'], defaultSort: 'created_at',
    columns: [['purchase_order_number', '발주번호'], ['supplier_name', '공급사'], ['status', '상태', 'status'], ['item_count', '품목 수'], ['outstanding_qty', '미입고'], ['total_amount', '발주금액', 'money'], ['expected_at', '입고예정', 'date'], ['created_at', '생성일', 'date']], action: { label: '발주 처리', type: 'procurement' } },
  members: { title: '회원 관리', eyebrow: 'CUSTOMER MANAGEMENT', description: '회원 상태와 관리자 역할을 확인합니다.', endpoint: 'members', id: 'user_id', statusOptions: ['active', 'inactive'], defaultSort: 'created_at',
    columns: [['name', '이름'], ['email', '이메일'], ['role', '계정 유형'], ['admin_role', '관리자 역할'], ['status', '상태', 'status'], ['created_at', '가입일', 'date']] },
  reviews: { title: '리뷰 관리', eyebrow: 'REVIEW MODERATION', description: '상품 리뷰를 검수하고 공개 상태를 관리합니다.', endpoint: 'reviews', id: 'review_id', statusOptions: ['pending', 'published', 'hidden', 'rejected'], defaultSort: 'created_at',
    columns: [['user_name', '작성자'], ['rating', '평점', 'rating'], ['body', '리뷰 내용'], ['status', '상태', 'status'], ['created_at', '작성일', 'date']], action: { label: '검수', type: 'review' } },
  audit: { title: '감사 로그', eyebrow: 'AUDIT TRAIL', description: '관리자의 데이터 변경 이력과 사유를 추적합니다.', endpoint: 'audit-logs', id: 'id', statusOptions: [], defaultSort: 'occurred_at',
    columns: [['action', '작업'], ['actor_id', '작업자 ID'], ['entity_type', '대상 유형'], ['entity_id', '대상 ID'], ['reason', '사유'], ['occurred_at', '처리일시', 'date']] },
};

export default function ResourcePage({ type }) {
  const config = configs[type];
  const [query, setQuery] = useState({ q: '', status: 'all', from: '', to: '', warehouseId: '', page: 1, pageSize: 20, sort: config.defaultSort, direction: 'desc' });
  const [result, setResult] = useState({ items: [], total: 0, pageCount: 1 });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState([]);
  const [dialog, setDialog] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  function patchQuery(changes) { setQuery(current => ({ ...current, ...changes })); }
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setQuery(current => ({ ...current, q: params.get('q') || '', status: params.get('status') || 'all', from: params.get('from') || '', to: params.get('to') || '', page: Number(params.get('page') || 1), warehouseId: localStorage.getItem('techzone-admin-warehouse') || '' }));
    const listener = event => patchQuery({ warehouseId: event.detail, page: 1 });
    window.addEventListener('techzone:warehouse', listener);
    return () => window.removeEventListener('techzone:warehouse', listener);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => load(), 250);
    const params = new URLSearchParams(Object.entries(query).filter(([, value]) => value !== '' && value !== 'all').map(([key, value]) => [key, String(value)]));
    window.history.replaceState({}, '', `${window.location.pathname}${params.size ? `?${params}` : ''}`);
    return () => clearTimeout(timer);
  }, [query]);

  async function load() {
    const session = readSession();
    if (!session?.user) { setLoading(false); setMessage('관리자 로그인이 필요합니다.'); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams(Object.entries(query).filter(([, value]) => value !== '' && value !== 'all').map(([key, value]) => [key, String(value)]));
      const response = await fetch(`${API}/admin/${config.endpoint}?${params}`, { credentials: 'include', headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.code || '목록을 불러오지 못했습니다.');
      setResult({ items: data.items || [], total: data.total || 0, pageCount: data.pageCount || 1 });
      setMessage('');
    } catch (error) { setMessage(error.message); } finally { setLoading(false); }
  }

  const columns = useMemo(() => {
    const list = [SelectColumn(), ...config.columns.map(([key, header, format]) => h.accessor(key, { header, enableSorting: true, cell: info => formatCell(format, info.getValue(), info.row.original) }))];
    if (config.action) list.push(h.display({ id: 'actions', header: '관리', enableHiding: false, cell: info => <button onClick={() => openAction(info.row.original)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50">{config.action.label}</button> }));
    return list;
  }, [type]);

  function openAction(row) {
    if (type === 'product') return window.location.href = `/admin/products/?id=${row.product_id}`;
    const definitions = {
      order: { title: `${row.order_number} 상태 변경`, description: '주문 상태 전이 규칙에 따라 처리되며 감사로그에 기록됩니다.', fields: [{ key: 'status', label: '변경 상태', type: 'select', defaultValue: row.status, options: config.statusOptions.map(value => ({ value, label: labels[value] || value })) }, { key: 'reason', label: '처리 사유', type: 'textarea', required: true }] },
      shipment: { title: `${row.shipment_number} 배송 처리`, description: '출고 단계와 송장번호를 변경합니다.', fields: [{ key: 'status', label: '배송 상태', type: 'select', defaultValue: row.status, options: config.statusOptions.map(value => ({ value, label: labels[value] || value })) }, { key: 'trackingNumber', label: '송장번호', defaultValue: row.tracking_number || '' }, { key: 'reason', label: '처리 사유', type: 'textarea', required: true }] },
      return: { title: `${row.return_number} 반품 처리`, description: row.status === 'received' ? '검수가 완료된 반품은 환불 처리할 수 있습니다.' : '반품 상태 전이와 사유를 기록합니다.', fields: row.status === 'received' ? [{ key: 'amount', label: '환불 금액', type: 'number', min: 1, required: true, defaultValue: row.refund_amount }, { key: 'reason', label: '환불 사유', type: 'textarea', required: true }] : [{ key: 'status', label: '처리 상태', type: 'select', defaultValue: row.status === 'requested' ? 'approved' : 'received', options: config.statusOptions.map(value => ({ value, label: labels[value] || value })) }, { key: 'reason', label: '처리 사유', type: 'textarea', required: true }] },
      inventory: { title: `${row.name || row.sku} 재고 조정`, description: `${row.warehouse_name}의 가용재고를 변경합니다. 모든 변경은 재고 원장과 감사로그에 기록됩니다.`, fields: [{ key: 'availableQty', label: '변경 후 가용재고', type: 'number', min: 0, required: true, defaultValue: row.available_qty }, { key: 'reason', label: '조정 사유', type: 'textarea', required: true }] },
      procurement: { title: `${row.purchase_order_number} 발주 처리`, description: row.status === 'draft' ? '발주서를 승인하면 공급사 발주가 확정됩니다.' : '입고 수량 처리는 발주 상세에서 진행합니다.', fields: [{ key: 'reason', label: '처리 사유', type: 'textarea', required: true }] },
      review: { title: '리뷰 공개 상태 변경', description: '고객에게 노출되는 리뷰 상태를 변경합니다.', fields: [{ key: 'status', label: '리뷰 상태', type: 'select', defaultValue: row.status, options: config.statusOptions.map(value => ({ value, label: labels[value] || value })) }, { key: 'reason', label: '검수 메모', type: 'textarea', required: true }] },
    };
    setDialog({ row, ...definitions[config.action.type] });
  }
  async function confirmAction(values) {
    const row = dialog.row;
    const requests = {
      order: [`orders/${row.order_id}/status`, 'PATCH', values],
      shipment: [`fulfillment/shipments/${row.shipment_id}/status`, 'PATCH', values],
      return: row.status === 'received' ? [`fulfillment/returns/${row.return_id}/refund`, 'POST', { ...values, amount: Number(values.amount) }] : [`fulfillment/returns/${row.return_id}/status`, 'PATCH', values],
      inventory: [`inventory/${row.product_id}`, 'PATCH', { ...values, availableQty: Number(values.availableQty), warehouseId: row.warehouse_id }],
      procurement: [`procurement/purchase-orders/${row.purchase_order_id}/approve`, 'PATCH', values],
      review: [`reviews/${row.review_id}`, 'PATCH', values],
    };
    const [path, method, body] = requests[config.action.type];
    setActionLoading(true);
    try {
      const response = await fetch(`${API}/${path}`, { method, credentials: 'include', headers: { 'content-type': 'application/json', ...authHeaders({ mutation: true }) }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(errorLabel(data.code));
      setDialog(null); setMessage('처리가 완료되었습니다.'); await load();
    } catch (error) { setMessage(error.message); } finally { setActionLoading(false); }
  }
  return <main className="p-4 md:p-7 xl:p-9"><div className="mx-auto max-w-[1540px]"><header className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-xs font-bold tracking-[.16em] text-indigo-600">{config.eyebrow}</p><h1 className="mt-2 text-3xl font-black tracking-[-.05em] md:text-4xl">{config.title}</h1><p className="mt-2 text-sm text-slate-500">{config.description}</p></div><div className="flex gap-2"><Button variant="outline" onClick={load}><RefreshCw size={15} className="mr-2"/>새로고침</Button>{config.primaryAction && <Link href={config.primaryAction.href}><Button><Plus size={15} className="mr-2"/>{config.primaryAction.label}</Button></Link>}</div></header>
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-end gap-3"><label className="grid gap-1.5 text-[11px] font-bold text-slate-500">상태<select value={query.status} disabled={!config.statusOptions.length} onChange={event => patchQuery({ status: event.target.value, page: 1 })} className="min-w-36 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-950 disabled:bg-slate-50"><option value="all">전체 상태</option>{config.statusOptions.map(value => <option key={value} value={value}>{labels[value] || value}</option>)}</select></label><label className="grid gap-1.5 text-[11px] font-bold text-slate-500">시작일<input type="date" value={query.from} onChange={event => patchQuery({ from: event.target.value, page: 1 })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-950"/></label><label className="grid gap-1.5 text-[11px] font-bold text-slate-500">종료일<input type="date" value={query.to} onChange={event => patchQuery({ to: event.target.value, page: 1 })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-950"/></label><button onClick={() => setQuery(current => ({ ...current, q: '', status: 'all', from: '', to: '', page: 1 }))} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-500"><SlidersHorizontal size={14}/>필터 초기화</button>{selected.length > 0 && config.action && <button onClick={() => openAction(result.items.find(item => String(item[config.id]) === selected[0]))} className="ml-auto rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white">선택 항목 처리 ({selected.length})</button>}</div></section>
    {message && <p role="status" className={`mt-4 rounded-xl p-3 text-sm font-semibold ${message.includes('완료') ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{message}</p>}
    <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><ServerDataTable data={result.items} columns={columns} query={query} onQueryChange={patchQuery} total={result.total} pageCount={result.pageCount} loading={loading} getRowId={row => String(row[config.id])} onSelectionChange={setSelected}/></section></div>
    <ActionDialog open={Boolean(dialog)} title={dialog?.title} description={dialog?.description} fields={dialog?.fields} loading={actionLoading} danger={dialog?.row?.status === 'received' && type === 'returns'} confirmLabel="확인 및 처리" onClose={() => setDialog(null)} onConfirm={confirmAction}/></main>;
}

function formatCell(format, value, row) {
  if (format === 'money') return <span className="font-bold">{money(value)}</span>;
  if (format === 'date') return <span className="text-xs text-slate-500">{date(value)}</span>;
  if (format === 'status') return <Status value={value}/>;
  if (format === 'rating') return <span className="font-bold text-amber-500">{'★'.repeat(Number(value || 0))}<span className="ml-1 text-slate-400">{value}</span></span>;
  if (typeof value === 'number') return <span className={row.available_qty !== undefined && value <= Number(row.safety_qty) ? 'font-black text-rose-600' : 'font-semibold'}>{new Intl.NumberFormat('ko-KR').format(value)}</span>;
  return <span className="block max-w-72 truncate" title={String(value || '')}>{value || '-'}</span>;
}
function Status({ value }) { const tone = ['cancelled', 'rejected', 'refunded'].includes(value) ? 'bg-rose-50 text-rose-700 ring-rose-100' : ['delivered', 'published', 'received', 'active'].includes(value) ? 'bg-emerald-50 text-emerald-700 ring-emerald-100' : ['shipped', 'approved', 'confirmed'].includes(value) ? 'bg-blue-50 text-blue-700 ring-blue-100' : 'bg-amber-50 text-amber-700 ring-amber-100'; return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${tone}`}>{labels[value] || value || '-'}</span>; }
function errorLabel(code) { return ({ INVALID_STATUS_TRANSITION: '현재 상태에서는 선택한 상태로 변경할 수 없습니다.', INSUFFICIENT_STOCK: '가용 재고가 부족합니다.', INVALID_REFUND_AMOUNT: '환불 가능 금액을 확인해주세요.', MISSING_PERMISSION: '이 작업을 수행할 권한이 없습니다.', PURCHASE_ORDER_NOT_DRAFT: '작성 중인 발주서만 승인할 수 있습니다.' })[code] || code || '처리에 실패했습니다.'; }
