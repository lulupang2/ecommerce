'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Heart, PackageCheck, ReceiptText, RotateCcw, ShieldCheck, UserRound } from 'lucide-react';
import StoreShell from '@/components/store/store-shell';
import ProductCard from '@/components/store/product-card';
import { api, money, statusLabel } from '@techzone/api-client/store';
import { readSession } from '@techzone/api-client/session';
import { readRecentlyViewed } from '@/lib/recent-products';

export default function Page() {
  const [recent, setRecent] = useState<any[]>([]);
  const [wishlist, setWishlist] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const session = typeof window === 'undefined' ? null : readSession();

  useEffect(() => {
    const activeSession = readSession();
    setRecent(readRecentlyViewed());

    if (!activeSession?.user) {
      setLoadingOrders(false);
      return;
    }

    Promise.allSettled([
      api(`/wishlists/${activeSession.user.id}`),
      api(`/orders?userId=${encodeURIComponent(activeSession.user.id)}`),
    ]).then(([wishlistResult, orderResult]) => {
      if (wishlistResult.status === 'fulfilled') setWishlist(wishlistResult.value.items || []);
      if (orderResult.status === 'fulfilled') setOrders(orderResult.value.items || []);
      setLoadingOrders(false);
    });
  }, []);

  const summary = useMemo(() => {
    const paidOrders = orders.filter(order => order.status !== 'cancelled');
    return {
      orderCount: paidOrders.length,
      totalPaid: paidOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0),
      shippingCount: orders.filter(order => ['preparing', 'shipped'].includes(order.status)).length,
    };
  }, [orders]);

  return (
    <StoreShell>
      <main className="mx-auto max-w-6xl px-4 py-14 md:px-8">
        <section className="overflow-hidden rounded-[2rem] bg-slate-950 p-6 text-white md:p-10">
          <p className="text-xs font-black tracking-[.24em] text-cyan-300">MY TECHZONE</p>
          <div className="mt-5 grid gap-8 md:grid-cols-[1fr_360px] md:items-end">
            <div>
              <h1 className="text-4xl font-black tracking-[-.06em] md:text-6xl">
                {session ? `${session.user.name}님의 쇼핑 허브` : '내 주문과 관심 상품을 한 곳에서'}
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
                주문 진행 상태, 배송 추적, 반품 가능 여부, 찜한 상품과 최근 본 상품까지 구매 후 흐름을 빠르게 확인하세요.
              </p>
            </div>
            <div className="rounded-3xl bg-white/10 p-5 ring-1 ring-white/10">
              <p className="text-xs font-bold text-slate-300">이번 계정 요약</p>
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <Metric label="주문" value={`${summary.orderCount}건`} />
                <Metric label="배송중" value={`${summary.shippingCount}건`} />
                <Metric label="누적 결제" value={money(summary.totalPaid)} />
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-4">
          <QuickLink href={session ? '/orders/' : '/login/'} icon={<UserRound />} title={session ? '회원 정보' : '로그인'} text={session ? '계정 정보와 주문을 확인합니다.' : '로그인하면 찜과 주문 내역이 저장됩니다.'} primary />
          <QuickLink href="/orders/" icon={<PackageCheck />} title="주문·배송" text="주문 상태와 배송 타임라인을 확인합니다." />
          <QuickLink href="/guest-orders/" icon={<ReceiptText />} title="비회원 주문조회" text="주문번호와 휴대폰 번호로 안전하게 조회합니다." />
          <QuickLink href="/guest-orders/" icon={<RotateCcw />} title="취소·반품" text="출고 전 취소, 배송 완료 후 7일 내 반품을 요청합니다." />
        </section>

        <section className="mt-10 rounded-3xl border bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black tracking-[.18em] text-cyan-600">RECENT ORDERS</p>
              <h2 className="mt-2 text-2xl font-black">최근 주문 현황</h2>
            </div>
            <a href="/orders/" className="inline-flex items-center gap-1 text-sm font-bold text-cyan-700">전체 주문 보기 <ArrowRight size={15} /></a>
          </div>
          {loadingOrders ? (
            <div className="mt-6 h-32 animate-pulse rounded-2xl bg-slate-100" />
          ) : orders.length ? (
            <div className="mt-6 grid gap-3">
              {orders.slice(0, 3).map(order => (
                <a key={order.id} href={`/orders/${order.order_number}/?id=${order.id}`} className="grid gap-3 rounded-2xl border p-4 transition hover:border-cyan-300 md:grid-cols-[1fr_auto] md:items-center">
                  <div>
                    <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-black text-cyan-700">{statusLabel[order.status] || order.status}</span>
                    <b className="mt-3 block">{order.order_number}</b>
                    <p className="mt-1 text-xs text-slate-500">{new Date(order.created_at).toLocaleDateString('ko-KR')} · 상품 {order.item_count}개 · {order.recipient}</p>
                  </div>
                  <b className="text-lg">{money(order.total_amount)}</b>
                </a>
              ))}
            </div>
          ) : (
            <EmptyState session={session} />
          )}
        </section>

        <Guide />
        <Section id="wishlist-products" title="찜한 상품" items={wishlist} icon={<Heart size={18} />} />
        <Section id="recent-products" title="최근 본 상품" items={recent} icon={<ShieldCheck size={18} />} />
      </main>
    </StoreShell>
  );
}

function Metric({ label, value }) {
  return <div><b className="block text-sm md:text-lg">{value}</b><span className="mt-1 block text-[10px] font-bold text-slate-400">{label}</span></div>;
}

function QuickLink({ href, icon, title, text, primary = false }) {
  return (
    <a href={href} className={`rounded-3xl p-6 transition ${primary ? 'bg-cyan-500 text-slate-950 hover:bg-cyan-400' : 'border bg-white hover:border-cyan-300'}`}>
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/70 text-slate-950">{icon}</span>
      <b className="mt-5 block text-lg">{title}</b>
      <p className={`mt-2 text-xs leading-5 ${primary ? 'text-slate-800' : 'text-slate-500'}`}>{text}</p>
    </a>
  );
}

function EmptyState({ session }) {
  return (
    <div className="mt-6 rounded-3xl bg-slate-50 py-14 text-center">
      <PackageCheck className="mx-auto text-slate-300" size={44} />
      <b className="mt-4 block">{session ? '아직 주문 내역이 없습니다.' : '로그인하거나 비회원 주문을 조회해 주세요.'}</b>
      <a href={session ? '/shop/' : '/guest-orders/'} className="mt-5 inline-flex rounded-xl bg-slate-950 px-6 py-3 text-sm font-bold text-white">
        {session ? '상품 보러 가기' : '비회원 주문 조회'}
      </a>
    </div>
  );
}

function Guide() {
  return (
    <section className="mt-8 grid gap-4 md:grid-cols-3">
      {[
        ['배송 추적', '출고 이후 송장과 배송 상태를 주문 상세에서 확인할 수 있습니다.'],
        ['주문 취소', '결제 대기·주문 확정 단계에서는 취소 요청이 가능합니다.'],
        ['반품 요청', '배송 완료 후 7일 이내 반품 접수를 지원합니다.'],
      ].map(([title, text]) => (
        <article key={title} className="rounded-2xl bg-slate-50 p-5">
          <b className="text-sm">{title}</b>
          <p className="mt-2 text-xs leading-5 text-slate-500">{text}</p>
        </article>
      ))}
    </section>
  );
}

function Section({ id, title, items, icon }) {
  return (
    <section id={id} className="mt-14 scroll-mt-24">
      <div className="flex items-center gap-2">
        <span className="text-cyan-700">{icon}</span>
        <h2 className="text-2xl font-black">{title}</h2>
      </div>
      {items.length ? (
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          {items.slice(0, 4).map(item => <ProductCard key={item.id} product={item} compact />)}
        </div>
      ) : (
        <p className="mt-5 rounded-2xl bg-slate-50 p-8 text-sm text-slate-400">아직 표시할 상품이 없습니다.</p>
      )}
    </section>
  );
}
