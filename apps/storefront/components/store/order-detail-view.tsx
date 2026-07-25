'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Circle, CreditCard, MapPin, Package, RotateCcw, ShieldCheck, Truck } from 'lucide-react';
import StoreShell from './store-shell';
import { api, money, statusLabel } from '@techzone/api-client/store';

const steps = ['pending', 'confirmed', 'preparing', 'shipped', 'delivered'];

export default function OrderDetailView({ orderNumber }) {
  const [order, setOrder] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const id = new URLSearchParams(location.search).get('id');
    if (!id) {
      setError('주문 식별 정보가 없습니다.');
      return;
    }
    const guestToken = localStorage.getItem(`techzone-guest-order-${orderNumber}`);
    api(guestToken ? `/orders/guest/${id}` : `/orders/${id}`, guestToken ? { headers: { authorization: `Bearer ${guestToken}` } } : {})
      .then(setOrder)
      .catch(() => setError('주문 상세를 불러오지 못했습니다.'));
  }, [orderNumber]);

  if (error) return <StoreShell><main className="mx-auto max-w-3xl p-10"><p className="rounded-xl bg-red-50 p-5 text-red-700">{error}</p></main></StoreShell>;
  if (!order) return <StoreShell><main className="mx-auto max-w-5xl p-10"><div className="h-96 animate-pulse rounded-3xl bg-slate-100" /></main></StoreShell>;

  const current = order.status === 'cancelled' ? -1 : Math.max(0, steps.indexOf(order.status));

  return (
    <StoreShell>
      <main className="mx-auto max-w-6xl px-4 py-14 md:px-8">
        <a href="/orders/" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-cyan-700"><ArrowLeft size={16} /> 주문 목록</a>
        <section className="mt-6 overflow-hidden rounded-[2rem] bg-slate-950 p-6 text-white md:p-10">
          <p className="text-xs font-black tracking-[.24em] text-cyan-300">ORDER DETAIL</p>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-5">
            <div>
              <h1 className="text-3xl font-black tracking-[-.04em] md:text-5xl">{order.order_number}</h1>
              <p className="mt-3 text-sm text-slate-300">{new Date(order.created_at).toLocaleString('ko-KR')} 주문 · 상품 {order.items.length}개</p>
            </div>
            <span className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-black text-slate-950">{statusLabel[order.status] || order.status}</span>
          </div>
        </section>

        <section className="mt-8 rounded-3xl border bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-black tracking-[.18em] text-cyan-600">FULFILLMENT TIMELINE</p>
              <h2 className="mt-2 text-2xl font-black">배송 진행 상태</h2>
            </div>
            {order.status === 'cancelled' && <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-black text-rose-700">취소된 주문</span>}
          </div>
          <div className="mt-8 grid grid-cols-5 gap-1">
            {steps.map((step, index) => (
              <div key={step} className="relative text-center">
                <div className={`relative z-10 mx-auto grid h-10 w-10 place-items-center rounded-full ${index <= current ? 'bg-cyan-500 text-slate-950' : 'bg-slate-100 text-slate-300'}`}>
                  {index < current ? <Check size={18} /> : index === current ? <Truck size={18} /> : <Circle size={13} />}
                </div>
                <p className="mt-3 text-[11px] font-black">{statusLabel[step]}</p>
                <p className="mt-1 hidden text-[10px] text-slate-400 md:block">{timelineText(step)}</p>
                {index < 4 && <span className={`absolute left-[60%] top-5 h-0.5 w-[80%] ${index < current ? 'bg-cyan-500' : 'bg-slate-100'}`} />}
              </div>
            ))}
          </div>
        </section>

        <div className="mt-8 grid gap-6 md:grid-cols-[1fr_360px]">
          <section className="rounded-3xl border bg-white p-6">
            <h2 className="text-xl font-black">주문 상품</h2>
            <div className="mt-4 divide-y">
              {order.items.map(item => <OrderItem key={item.id} item={item} />)}
            </div>
          </section>
          <aside className="grid gap-4">
            <InfoCard icon={<CreditCard size={18} />} title="결제 정보">
              <Row label="상품 금액" value={money(order.subtotal_amount)} />
              <Row label="할인" value={`-${money(order.discount_amount)}`} />
              <Row label="배송비" value={order.shipping_fee ? money(order.shipping_fee) : '무료'} />
              <div className="flex justify-between border-t pt-4 text-lg font-black"><dt>총 결제</dt><dd className="text-cyan-700">{money(order.total_amount)}</dd></div>
            </InfoCard>
            <InfoCard icon={<MapPin size={18} />} title="배송 정보">
              <Row label="받는 분" value={order.recipient} />
              <Row label="연락처" value={order.phone} />
              <Row label="배송지" value={order.address} />
            </InfoCard>
            <PolicyCard status={order.status} />
          </aside>
        </div>
      </main>
    </StoreShell>
  );
}

function OrderItem({ item }) {
  return (
    <article className="grid grid-cols-[80px_1fr] gap-4 py-5 md:grid-cols-[88px_1fr_auto]">
      <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-xl bg-slate-100 md:h-22 md:w-22">
        {item.image ? <img src={item.image} className="h-full w-full object-cover" alt="" /> : <Package className="text-slate-300" />}
      </div>
      <div>
        <p className="text-[10px] font-black tracking-wider text-slate-400">{item.brand || item.sku}</p>
        <b className="mt-1 block text-sm">{item.name}</b>
        <p className="mt-1 text-xs text-slate-500">{item.sku} · 수량 {item.quantity}개</p>
      </div>
      <b className="text-sm md:text-right">{money(item.unit_price * item.quantity)}</b>
    </article>
  );
}

function InfoCard({ icon, title, children }) {
  return <section className="rounded-3xl border bg-white p-6"><h2 className="flex items-center gap-2 text-lg font-black text-slate-950"><span className="text-cyan-700">{icon}</span>{title}</h2><dl className="mt-5 grid gap-4 text-sm">{children}</dl></section>;
}

function Row({ label, value }) {
  return <div><dt className="text-xs font-bold text-slate-400">{label}</dt><dd className="mt-1 leading-6">{value}</dd></div>;
}

function PolicyCard({ status }) {
  const canCancel = ['pending', 'confirmed'].includes(status);
  const canReturn = status === 'delivered';
  return (
    <section className="rounded-3xl bg-slate-950 p-6 text-white">
      <h2 className="flex items-center gap-2 text-lg font-black"><ShieldCheck className="text-cyan-300" size={18} /> 취소·반품 정책</h2>
      <p className="mt-3 text-sm leading-6 text-slate-300">
        {canCancel ? '현재 단계에서는 주문 취소 요청이 가능합니다.' : canReturn ? '배송 완료 후 7일 이내라면 반품 요청이 가능합니다.' : '현재 단계에서는 고객센터 확인 후 처리됩니다.'}
      </p>
      <div className="mt-5 rounded-2xl bg-white/10 p-4 text-xs leading-5 text-slate-300">
        <RotateCcw className="mb-2 text-cyan-300" size={16} />
        출고 준비 전 취소, 배송 완료 후 7일 내 반품이라는 정책을 화면에 명확히 노출해 상용몰 신뢰감을 높였습니다.
      </div>
    </section>
  );
}

function timelineText(step: string) {
  return ({ pending: '결제 확인 전', confirmed: '주문 접수 완료', preparing: '상품 포장 중', shipped: '택배 이동 중', delivered: '수령 완료' } as Record<string, string>)[step] || '';
}
