'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, PackageCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getGuestId, readSession } from '@/lib/session';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:18080/api';
const money = value => `${new Intl.NumberFormat('ko-KR').format(value)}원`;
const statusLabel = { pending: '처리 중', confirmed: '주문 확정', cancelled: '주문 취소' };

export default function OrdersPage() {
  const [view, setView] = useState({ loading: true, user: null, items: [], error: '' });
  useEffect(() => {
    const session = readSession();
    const userId = session?.user?.id || getGuestId();
    fetch(`${apiBase}/orders?userId=${encodeURIComponent(userId)}`).then(async response => {
      const data = await response.json(); if (!response.ok) throw new Error(data.code || 'ORDER_HISTORY_FAILED'); return data;
    }).then(data => setView({ loading: false, user: session?.user || null, items: data.items, error: '' })).catch(() => setView({ loading: false, user: session?.user || null, items: [], error: '주문 내역을 불러오지 못했습니다.' }));
  }, []);

  return <main className="min-h-screen bg-[#f6f8fc] px-5 py-8 text-slate-950 md:px-10"><div className="mx-auto max-w-5xl"><div className="flex items-center justify-between"><a href="/" className="inline-flex items-center gap-2 text-sm font-bold"><ArrowLeft size={16}/> 스토어</a><a href="/login/" className="text-sm font-bold text-blue-600">{view.user ? `${view.user.name}님` : '로그인'}</a></div><header className="py-16"><p className="text-[10px] font-bold tracking-[.24em] text-blue-600">MY TECHZONE</p><h1 className="mt-4 text-5xl font-black tracking-[-.08em] md:text-7xl">주문 내역.</h1><p className="mt-5 text-sm text-slate-500">{view.user ? `${view.user.name}님의 최근 주문입니다.` : '현재 기기에 저장된 게스트 주문입니다. 로그인하면 계정별로 관리할 수 있습니다.'}</p></header>{view.loading ? <p className="rounded-2xl bg-white p-8 text-sm">주문 내역을 불러오는 중...</p> : view.error ? <p role="alert" className="rounded-2xl bg-red-50 p-8 text-sm text-red-700">{view.error}</p> : view.items.length ? <div className="grid gap-4">{view.items.map(order => <article key={order.id} className="grid gap-5 rounded-2xl bg-white p-6 shadow-sm md:grid-cols-[96px_1fr_auto] md:items-center"><div className="grid h-24 place-items-center overflow-hidden rounded-xl bg-slate-100">{order.image ? <img src={order.image} alt="" className="h-full w-full object-cover"/> : <PackageCheck className="text-blue-600"/>}</div><div><div className="flex flex-wrap items-center gap-3"><span className={`rounded-full px-3 py-1 text-[11px] font-bold ${order.status === 'confirmed' ? 'bg-blue-50 text-blue-700' : order.status === 'cancelled' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{statusLabel[order.status] || order.status}</span><span className="text-xs text-slate-400">{new Date(order.created_at).toLocaleDateString('ko-KR')}</span></div><h2 className="mt-3 text-lg font-black">{order.order_number}</h2><p className="mt-1 text-sm text-slate-500">상품 {order.item_count}개 · 받는 분 {order.recipient}</p></div><div className="md:text-right"><p className="font-black">{money(order.total_amount)}</p><a href={`/orders/detail/?id=${order.id}`} className="mt-3 inline-flex items-center text-xs font-bold text-blue-600">상세 보기 <ArrowRight className="ml-1" size={14}/></a></div></article>)}</div> : <div className="rounded-3xl bg-white px-8 py-16 text-center"><PackageCheck className="mx-auto text-blue-600" size={40}/><h2 className="mt-5 text-2xl font-black">아직 주문이 없습니다.</h2><p className="mt-2 text-sm text-slate-500">새로운 IT 기기를 둘러보고 첫 주문을 시작해보세요.</p><a href="/#shop"><Button className="mt-7">상품 보러 가기 <ArrowRight className="ml-2" size={16}/></Button></a></div>}</div></main>;
}
