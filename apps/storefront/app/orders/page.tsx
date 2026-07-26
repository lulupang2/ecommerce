'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, PackageCheck, Search, Truck } from 'lucide-react';
import StoreShell from '@/components/store/store-shell';
import { money, statusLabel } from '@techzone/api-client/store';
import { useMemberOrders } from '@/lib/storefront-queries';

const filters = [
  { value: 'all', label: '전체' },
  { value: 'pending', label: '결제 대기' },
  { value: 'confirmed', label: '주문 확정' },
  { value: 'preparing', label: '상품 준비' },
  { value: 'shipped', label: '배송 중' },
  { value: 'delivered', label: '배송 완료' },
  { value: 'cancelled', label: '취소' },
];

export default function OrdersPage() {
  const ordersQuery = useMemberOrders();
  const view = {
    loading: !ordersQuery.identityReady || (Boolean(ordersQuery.session) && ordersQuery.isPending),
    items: ordersQuery.orders,
    user: ordersQuery.session?.user || null,
    error: ordersQuery.isError ? '주문 내역을 불러오지 못했습니다.' : '',
  };
  const [status, setStatus] = useState('all');
  const [keyword, setKeyword] = useState('');

  const items = useMemo(() => view.items.filter(order => {
    const matchesStatus = status === 'all' || order.status === status;
    const haystack = `${order.order_number} ${order.recipient} ${order.status}`.toLowerCase();
    return matchesStatus && haystack.includes(keyword.toLowerCase());
  }), [view.items, status, keyword]);

  const counts = useMemo(() => Object.fromEntries(filters.map(filter => [
    filter.value,
    filter.value === 'all' ? view.items.length : view.items.filter(order => order.status === filter.value).length,
  ])), [view.items]);

  return (
    <StoreShell>
      <main className="mx-auto max-w-6xl px-4 py-14 md:px-8">
        <section className="rounded-[2rem] bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-6 text-white md:p-10">
          <p className="text-xs font-black tracking-[.24em] text-cyan-300">ORDER CENTER</p>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-6">
            <div>
              <h1 className="text-4xl font-black tracking-[-.06em] md:text-6xl">주문·배송 조회</h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
                주문 상태, 결제 금액, 배송 진행 상황을 한 화면에서 확인하고 상세 타임라인으로 이동할 수 있습니다.
              </p>
            </div>
            <a href="/guest-orders/" className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-slate-950">비회원 주문 조회</a>
          </div>
        </section>

        <section className="mt-8 rounded-3xl border bg-white p-5">
          <div className="grid gap-3 md:grid-cols-[1fr_220px]">
            <label className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input value={keyword} onChange={event => setKeyword(event.target.value)} className="h-12 w-full rounded-2xl border bg-slate-50 pl-11 pr-4 text-sm outline-none focus:border-cyan-400" placeholder="주문번호, 받는 분, 상태 검색" />
            </label>
            <a href="/mypage/" className="grid h-12 place-items-center rounded-2xl border text-sm font-bold hover:border-cyan-300">마이페이지로 이동</a>
          </div>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {filters.map(filter => (
              <button key={filter.value} onClick={() => setStatus(filter.value)} className={`shrink-0 rounded-full px-4 py-2 text-xs font-black ${status === filter.value ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-500'}`}>
                {filter.label} {counts[filter.value] || 0}
              </button>
            ))}
          </div>
        </section>

        {view.loading ? (
          <div className="mt-10 h-64 animate-pulse rounded-3xl bg-slate-100" />
        ) : view.error ? (
          <p className="mt-8 rounded-xl bg-red-50 p-5 text-red-700">{view.error}</p>
        ) : items.length ? (
          <div className="mt-8 grid gap-4">
            {items.map(order => <OrderCard key={order.id} order={order} />)}
          </div>
        ) : (
          <EmptyOrders user={view.user} />
        )}
      </main>
    </StoreShell>
  );
}

function OrderCard({ order }) {
  const isActive = ['preparing', 'shipped'].includes(order.status);
  return (
    <article className="grid gap-5 rounded-3xl border bg-white p-5 shadow-sm shadow-slate-200/60 transition hover:border-cyan-300 md:grid-cols-[96px_1fr_180px] md:items-center">
      <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-2xl bg-slate-100">
        {order.image ? <img src={order.image} className="h-full w-full object-cover" alt="" /> : <PackageCheck className="text-cyan-700" />}
      </div>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-black ${isActive ? 'bg-cyan-50 text-cyan-700' : 'bg-slate-100 text-slate-600'}`}>{statusLabel[order.status] || order.status}</span>
          <span className="inline-flex items-center gap-1 text-xs text-slate-400"><CalendarDays size={13} /> {new Date(order.created_at).toLocaleDateString('ko-KR')}</span>
        </div>
        <h2 className="mt-3 text-lg font-black">{order.order_number}</h2>
        <p className="mt-1 text-sm text-slate-500">상품 {order.item_count}개 · 받는 분 {order.recipient}</p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-cyan-500" style={{ width: `${progress(order.status)}%` }} />
        </div>
      </div>
      <div className="md:text-right">
        <b className="text-xl">{money(order.total_amount)}</b>
        <a href={`/orders/${order.order_number}/?id=${order.id}`} className="mt-4 inline-flex items-center gap-1 rounded-xl bg-slate-950 px-4 py-3 text-xs font-black text-white">
          상세 보기 <ArrowRight size={14} />
        </a>
      </div>
    </article>
  );
}

function progress(status: string) {
  return ({ pending: 12, confirmed: 28, preparing: 48, shipped: 76, delivered: 100, cancelled: 100 } as Record<string, number>)[status] || 20;
}

function EmptyOrders({ user }) {
  return (
    <div className="mt-10 rounded-3xl bg-slate-50 py-20 text-center">
      <Truck className="mx-auto text-slate-300" size={52} />
      <b className="mt-5 block">{user ? '조건에 맞는 주문이 없습니다.' : '로그인하거나 비회원 주문을 조회해 주세요.'}</b>
      <p className="mt-2 text-sm text-slate-500">TECHZONE은 주문번호와 휴대폰 검증으로 비회원 주문도 안전하게 조회합니다.</p>
      <a href={user ? '/shop/' : '/guest-orders/'} className="mt-6 inline-block rounded-xl bg-slate-950 px-6 py-3 text-sm font-bold text-white">
        {user ? '상품 보러 가기' : '비회원 주문 조회'}
      </a>
    </div>
  );
}
