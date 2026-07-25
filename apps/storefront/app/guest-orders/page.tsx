'use client';

import { useState } from 'react';
import { ArrowRight, LockKeyhole, PackageSearch, RotateCcw, ShieldCheck, Truck } from 'lucide-react';
import StoreShell from '@/components/store/store-shell';
import { api, money, statusLabel } from '@techzone/api-client/store';

export default function Page() {
  const [order, setOrder] = useState<any>(null);
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function lookup(event) {
    event.preventDefault();
    setMessage('');
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      const access = await api('/orders/guest/access', { method: 'POST', body: JSON.stringify({ orderNumber: form.get('orderNumber'), phone: form.get('phone') }) });
      const data = await api(`/orders/guest/${access.orderId}`, { headers: { authorization: `Bearer ${access.accessToken}` } });
      localStorage.setItem(`techzone-guest-order-${data.order_number}`, access.accessToken);
      setOrder(data);
      setToken(access.accessToken);
    } catch {
      setMessage('주문번호와 휴대폰 번호를 다시 확인해 주세요.');
    } finally {
      setLoading(false);
    }
  }

  async function cancel() {
    try {
      await api(`/orders/guest/${order.id}/cancel`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ reason: '고객 요청' }) });
      setOrder({ ...order, status: 'cancelled' });
      setMessage('주문 취소 요청이 완료되었습니다.');
    } catch {
      setMessage('현재 상태에서는 주문을 취소할 수 없습니다.');
    }
  }

  async function requestReturn() {
    try {
      const value = await api('/fulfillment/returns/guest', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ orderId: order.id, reason: '고객 반품 요청', refundAmount: order.total_amount }) });
      setMessage(`반품 ${value.returnNumber}이 접수되었습니다.`);
    } catch {
      setMessage('배송 완료 후 7일 이내에만 반품을 요청할 수 있습니다.');
    }
  }

  return (
    <StoreShell>
      <main className="mx-auto max-w-6xl px-4 py-14 md:px-8">
        <section className="grid gap-8 rounded-[2rem] bg-slate-950 p-6 text-white md:grid-cols-[1fr_420px] md:p-10">
          <div>
            <p className="text-xs font-black tracking-[.24em] text-cyan-300">GUEST ORDER</p>
            <h1 className="mt-4 text-4xl font-black tracking-[-.06em] md:text-6xl">비회원 주문조회</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
              주문번호와 주문 시 입력한 휴대폰 번호를 검증해 15분 동안 유효한 주문 전용 접근 권한으로 조회합니다.
            </p>
            <div className="mt-6 grid gap-3 text-sm md:grid-cols-3">
              <Guide icon={<LockKeyhole size={16} />} title="주문 격리" text="해당 주문만 조회" />
              <Guide icon={<Truck size={16} />} title="배송 추적" text="상태 타임라인 제공" />
              <Guide icon={<RotateCcw size={16} />} title="취소·반품" text="정책 조건 내 요청" />
            </div>
          </div>
          <form onSubmit={lookup} className="rounded-3xl bg-white p-5 text-slate-950">
            <label className="grid gap-2 text-xs font-black">주문번호<input required name="orderNumber" className="h-12 rounded-xl border bg-slate-50 px-4 text-sm outline-none focus:border-cyan-400" placeholder="TZ-2026-00000000" /></label>
            <label className="mt-4 grid gap-2 text-xs font-black">휴대폰 번호<input required name="phone" className="h-12 rounded-xl border bg-slate-50 px-4 text-sm outline-none focus:border-cyan-400" placeholder="010-0000-0000" /></label>
            <button disabled={loading} className="mt-5 h-12 w-full rounded-xl bg-cyan-500 font-black text-slate-950 disabled:opacity-60">{loading ? '조회 중...' : '주문 조회'}</button>
            <p className="mt-4 flex gap-2 rounded-2xl bg-cyan-50 p-4 text-xs leading-5 text-cyan-800"><ShieldCheck size={16} className="shrink-0" /> 주문번호와 휴대폰 번호가 일치할 때만 상세 조회·취소·반품 요청이 가능합니다.</p>
          </form>
        </section>

        {message && <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-700">{message}</p>}
        {order && <OrderResult order={order} onCancel={cancel} onReturn={requestReturn} />}
      </main>
    </StoreShell>
  );
}

function Guide({ icon, title, text }) {
  return <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10"><span className="text-cyan-300">{icon}</span><b className="mt-2 block">{title}</b><p className="mt-1 text-xs text-slate-400">{text}</p></div>;
}

function OrderResult({ order, onCancel, onReturn }) {
  return (
    <section className="mt-8 grid gap-6 md:grid-cols-[1fr_340px]">
      <div className="rounded-3xl border bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-black text-cyan-700">{statusLabel[order.status] || order.status}</span>
            <h2 className="mt-3 text-2xl font-black">{order.order_number}</h2>
            <p className="mt-1 text-sm text-slate-500">{new Date(order.created_at).toLocaleString('ko-KR')} 주문</p>
          </div>
          <PackageSearch className="text-cyan-700" size={34} />
        </div>
        <div className="mt-6 divide-y">
          {order.items.map(item => (
            <article key={item.id} className="flex gap-4 py-4">
              <img src={item.image} className="h-18 w-18 rounded-xl object-cover" alt="" />
              <div className="min-w-0">
                <b className="line-clamp-2 text-sm">{item.name}</b>
                <p className="mt-1 text-xs text-slate-400">{item.quantity}개 · {money(item.unit_price)}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
      <aside className="rounded-3xl bg-slate-950 p-6 text-white">
        <h3 className="text-xl font-black">주문 처리</h3>
        <div className="mt-5 flex justify-between border-b border-slate-800 pb-5 text-lg font-black"><span>결제 금액</span><span className="text-cyan-300">{money(order.total_amount)}</span></div>
        <div className="mt-5 grid gap-3">
          {['pending', 'confirmed'].includes(order.status) && <button onClick={onCancel} className="h-12 rounded-xl border border-rose-300 font-bold text-rose-200">주문 취소 요청</button>}
          {order.status === 'delivered' && <button onClick={onReturn} className="h-12 rounded-xl border border-cyan-300 font-bold text-cyan-200">반품 요청</button>}
          <a href={`/orders/${order.order_number}/?id=${order.id}`} className="grid h-12 place-items-center rounded-xl bg-cyan-400 font-black text-slate-950">상세 타임라인 보기</a>
          <a href="/shop/" className="inline-flex h-12 items-center justify-center gap-1 rounded-xl bg-white/10 font-bold">다시 쇼핑하기 <ArrowRight size={15} /></a>
        </div>
      </aside>
    </section>
  );
}
