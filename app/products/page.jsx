'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getCurrentUserId } from '@/lib/session';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:18080/api';
const money = value => `${new Intl.NumberFormat('ko-KR').format(value)}원`;

export default function ProductDetailPage() {
  const [view, setView] = useState({ loading: true, product: null, error: '' });
  const [added, setAdded] = useState(false);
  useEffect(() => { const id = new URLSearchParams(window.location.search).get('id'); if (!id) return setView({ loading: false, product: null, error: '상품을 찾을 수 없습니다.' }); fetch(`${apiBase}/products/${encodeURIComponent(id)}`).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.code); return data; }).then(product => setView({ loading: false, product, error: '' })).catch(() => setView({ loading: false, product: null, error: '상품 정보를 불러오지 못했습니다.' })); }, []);
  async function addToCart() { const product = view.product; const response = await fetch(`${apiBase}/carts/${getCurrentUserId()}/items`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ productId: product.id, name: product.name, brand: product.brand, image: product.image, price: product.price, quantity: 1 }) }); if (response.ok) setAdded(true); }
  if (view.loading) return <main className="min-h-screen bg-[#f6f8fc] p-8 text-sm">상품 정보를 불러오는 중...</main>;
  if (view.error) return <main className="min-h-screen bg-[#f6f8fc] p-8"><a href="/#shop" className="inline-flex items-center gap-2 text-sm font-bold"><ArrowLeft size={16}/> 스토어</a><p className="mx-auto mt-20 max-w-xl rounded-2xl bg-red-50 p-8 text-red-700">{view.error}</p></main>;
  const product = view.product;
  return <main className="min-h-screen bg-[#f6f8fc] px-5 py-8 text-slate-950 md:px-10"><div className="mx-auto max-w-7xl"><div className="flex items-center justify-between"><a href="/#shop" className="inline-flex items-center gap-2 text-sm font-bold"><ArrowLeft size={16}/> 스토어로 돌아가기</a><a href="/orders/" className="text-sm font-bold text-blue-600">주문 내역</a></div><section className="mt-10 grid overflow-hidden rounded-3xl bg-white md:grid-cols-[1.1fr_.9fr]"><div className="min-h-[420px] bg-slate-100"><img src={product.image} alt={product.name} className="h-full min-h-[420px] w-full object-cover"/></div><div className="flex flex-col justify-center p-8 md:p-16"><p className="text-[10px] font-bold tracking-[.24em] text-blue-600">{product.brand} · {product.category}</p><h1 className="mt-5 text-5xl font-black tracking-[-.08em] md:text-7xl">{product.name}</h1><p className="mt-6 text-xl font-black">{money(product.price)}</p><p className="mt-8 max-w-md text-sm leading-7 text-slate-600">{product.note}</p><div className="mt-8 flex justify-between border-y border-slate-200 py-4 text-sm"><span className="text-slate-500">색상 / 옵션</span><b>{product.color}</b></div>{added ? <div className="mt-8 flex items-center gap-2 rounded-xl bg-blue-50 p-4 text-sm font-bold text-blue-700"><Check size={18}/> 장바구니에 담았습니다.</div> : <Button className="mt-8 h-14 w-full" onClick={addToCart}>장바구니 담기 <ShoppingBag className="ml-2" size={17}/></Button>}<a href="/#shop" className="mt-5 inline-flex items-center justify-center text-sm font-bold text-slate-500">다른 상품 보기 <ArrowRight className="ml-2" size={15}/></a></div></section></div></main>;
}
