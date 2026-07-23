'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, PackageCheck } from 'lucide-react';
import StoreShell from '@/components/store/store-shell';
import { api, money, statusLabel } from '@/lib/store';
import { readSession } from '@/lib/session';

export default function OrdersPage() {
  const [view, setView] = useState({ loading: true, items: [], user: null, error: '' });

  useEffect(() => {
    const session = readSession();
    if (!session?.user) {
      setView({ loading: false, items: [], user: null, error: '' });
      return;
    }
    api(`/orders?userId=${encodeURIComponent(session.user.id)}`)
      .then(data => setView({ loading: false, items: data.items || [], user: session.user, error: '' }))
      .catch(() => setView({ loading: false, items: [], user: session.user, error: '주문 내역을 불러오지 못했습니다.' }));
  }, []);

  return (
    <StoreShell>
      <main className="mx-auto max-w-5xl px-4 py-14 md:px-8">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="text-xs font-black tracking-[.2em] text-indigo-600">MY TECHZONE</p>
            <h1 className="mt-3 text-4xl font-black tracking-[-.06em]">주문 내역</h1>
            <p className="mt-3 text-sm text-slate-500">
              {view.user ? `${view.user.name}님의 주문입니다.` : '비회원 주문은 주문번호와 휴대폰 번호로 안전하게 조회할 수 있습니다.'}
            </p>
          </div>
          <a href="/guest-orders/" className="shrink-0 text-sm font-bold text-indigo-600">비회원 주문 조회</a>
        </div>

        {view.loading ? (
          <div className="mt-10 h-48 animate-pulse rounded-2xl bg-slate-100" />
        ) : view.error ? (
          <p className="mt-8 rounded-xl bg-red-50 p-5 text-red-700">{view.error}</p>
        ) : view.items.length ? (
          <div className="mt-10 grid gap-4">
            {view.items.map(order => (
              <article key={order.id} className="grid gap-5 rounded-2xl border bg-white p-5 md:grid-cols-[90px_1fr_auto] md:items-center">
                <div className="grid h-22 w-22 place-items-center overflow-hidden rounded-xl bg-slate-100">
                  {order.image ? <img src={order.image} className="h-full w-full object-cover" alt="" /> : <PackageCheck className="text-indigo-600" />}
                </div>
                <div>
                  <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">{statusLabel[order.status] || order.status}</span>
                  <h2 className="mt-3 font-black">{order.order_number}</h2>
                  <p className="mt-1 text-xs text-slate-400">
                    {new Date(order.created_at).toLocaleDateString('ko-KR')} · 상품 {order.item_count}개 · {order.recipient}
                  </p>
                </div>
                <div className="md:text-right">
                  <b>{money(order.total_amount)}</b>
                  <a href={`/orders/${order.order_number}/?id=${order.id}`} className="mt-3 flex items-center text-xs font-bold text-indigo-600 md:justify-end">
                    상세 보기 <ArrowRight size={14} />
                  </a>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-10 rounded-3xl bg-slate-50 py-20 text-center">
            <PackageCheck className="mx-auto text-slate-300" size={48} />
            <b className="mt-5 block">{view.user ? '아직 주문이 없습니다.' : '로그인하거나 비회원 주문을 조회해 주세요.'}</b>
            <a href={view.user ? '/shop/' : '/guest-orders/'} className="mt-5 inline-block rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white">
              {view.user ? '상품 보러 가기' : '비회원 주문 조회'}
            </a>
          </div>
        )}
      </main>
    </StoreShell>
  );
}
