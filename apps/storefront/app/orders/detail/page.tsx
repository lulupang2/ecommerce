'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Circle, Package } from 'lucide-react';
import { authHeaders } from '@techzone/api-client/session';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:18080/api';
const money = value => `${new Intl.NumberFormat('ko-KR').format(value)}원`;
const statusLabel = { pending: '처리 중', confirmed: '주문 확정', cancelled: '주문 취소' };

export default function OrderDetailPage() {
  const [view, setView] = useState({ loading: true, order: null, error: '' });
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id');
    if (!id) { setView({ loading: false, order: null, error: '주문 번호가 없습니다.' }); return; }
    fetch(`${apiBase}/orders/${encodeURIComponent(id)}`, { credentials: 'include', headers: authHeaders() }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.code); return data; }).then(order => setView({ loading: false, order, error: '' })).catch(() => setView({ loading: false, order: null, error: '주문 상세를 불러오지 못했습니다.' }));
  }, []);

  if (view.loading) return <main className="min-h-screen bg-[#f6f8fc] p-8 text-sm">주문 정보를 불러오는 중...</main>;
  if (view.error) return <main className="min-h-screen bg-[#f6f8fc] p-8"><a href="/orders/" className="inline-flex items-center gap-2 text-sm font-bold"><ArrowLeft size={16}/> 주문 내역</a><p className="mx-auto mt-20 max-w-xl rounded-2xl bg-red-50 p-8 text-red-700">{view.error}</p></main>;
  const order = view.order;
  return <main className="min-h-screen bg-[#f6f8fc] px-5 py-8 text-slate-950 md:px-10"><div className="mx-auto max-w-4xl"><a href="/orders/" className="inline-flex items-center gap-2 text-sm font-bold"><ArrowLeft size={16}/> 주문 내역</a><header className="py-14"><p className="text-[10px] font-bold tracking-[.24em] text-blue-600">ORDER DETAIL</p><h1 className="mt-4 text-4xl font-black tracking-[-.06em] md:text-6xl">{order.order_number}</h1><div className="mt-5 flex items-center gap-3 text-sm"><span className="rounded-full bg-blue-50 px-3 py-1 font-bold text-blue-700">{statusLabel[order.status] || order.status}</span><span className="text-slate-400">{new Date(order.created_at).toLocaleString('ko-KR')}</span></div></header><section className="grid gap-6 md:grid-cols-[1.35fr_.65fr]"><div className="rounded-3xl bg-white p-6"><h2 className="text-lg font-black">주문 상품</h2><div className="mt-5 divide-y">{order.items.map(item => <article key={item.id} className="grid grid-cols-[80px_1fr_auto] gap-4 py-5 first:pt-0"><div className="grid h-20 place-items-center overflow-hidden rounded-xl bg-slate-100">{item.image ? <img src={item.image} alt="" className="h-full w-full object-cover"/> : <Package/>}</div><div><p className="text-[10px] font-bold tracking-wider text-slate-400">{item.brand}</p><h3 className="mt-1 text-sm font-bold">{item.name}</h3><p className="mt-1 text-xs text-slate-500">수량 {item.quantity}</p></div><b className="text-sm">{money(item.unit_price * item.quantity)}</b></article>)}</div><div className="mt-6 flex justify-between border-t pt-5 text-lg font-black"><span>총 결제 금액</span><span>{money(order.total_amount)}</span></div></div><aside className="rounded-3xl bg-slate-950 p-6 text-white"><h2 className="text-lg font-black">배송 정보</h2><dl className="mt-6 grid gap-5 text-sm"><div><dt className="text-xs text-slate-400">받는 분</dt><dd className="mt-1 font-bold">{order.recipient}</dd></div><div><dt className="text-xs text-slate-400">연락처</dt><dd className="mt-1 font-bold">{order.phone}</dd></div><div><dt className="text-xs text-slate-400">주소</dt><dd className="mt-1 leading-6">{order.address}</dd></div></dl><div className="mt-8 border-t border-slate-700 pt-6"><p className="flex items-center gap-2 text-sm font-bold">{order.status === 'confirmed' ? <Check className="text-blue-300" size={18}/> : <Circle className="text-amber-300" size={16}/>} {statusLabel[order.status] || order.status}</p></div></aside></section></div></main>;
}
