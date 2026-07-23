'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Package, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { readSession } from '@/lib/session';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:18080/api';
const money = value => `${new Intl.NumberFormat('ko-KR').format(value)}원`;
const orderStatuses = ['pending', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled'];
const productStatuses = ['published', 'hidden', 'archived'];

export default function AdminPage() {
  const [session, setSession] = useState(undefined);
  const [data, setData] = useState({ products: [], inventory: [], orders: [] });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const token = session?.accessToken;
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  async function load() {
    setLoading(true);
    const options = { headers };
    const [products, inventory, orders] = await Promise.all([
      fetch(`${apiBase}/products?status=all`, options).then(r => r.json()),
      fetch(`${apiBase}/inventory`, options).then(r => r.json()),
      fetch(`${apiBase}/orders`, options).then(r => r.json())
    ]);
    if (!products.items || !inventory.items || !orders.items) throw new Error('관리자 권한이 필요합니다.');
    setData({ products: products.items, inventory: inventory.items, orders: orders.items });
    setLoading(false);
  }
  useEffect(() => setSession(readSession()), []);
  useEffect(() => { if (session?.user?.role === 'admin') load().catch(() => { setLoading(false); setMessage('관리자 데이터를 불러오지 못했습니다.'); }); else if (session) setLoading(false); }, [session]);
  const stockMap = useMemo(() => Object.fromEntries(data.inventory.map(item => [item.product_id, item.available_qty])), [data.inventory]);
  async function updateProduct(id, changes) { const response = await fetch(`${apiBase}/products/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(changes) }); if (!response.ok) throw new Error('상품 저장 실패'); setMessage('상품 정보를 저장했습니다.'); await load(); }
  async function updateStock(id, value) { const response = await fetch(`${apiBase}/inventory/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ availableQty: Number(value) }) }); if (!response.ok) throw new Error('재고 저장 실패'); setMessage('재고를 저장했습니다.'); await load(); }
  async function updateOrder(id, status) { const response = await fetch(`${apiBase}/orders/${id}/status`, { method: 'PATCH', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ status }) }); if (!response.ok) throw new Error('주문 상태 저장 실패'); setMessage('주문 상태를 저장했습니다.'); await load(); }
  if (session !== undefined && session?.user?.role !== 'admin') return <main className="min-h-screen bg-[#f6f8fc] px-5 py-16 text-slate-950"><div className="mx-auto max-w-xl rounded-3xl bg-white p-10 text-center shadow-sm"><ShieldCheck className="mx-auto text-blue-600"/><h1 className="mt-5 text-3xl font-black">관리자 계정이 필요합니다</h1><p className="mt-3 text-sm text-slate-500">운영 콘솔은 관리자 권한으로 로그인한 계정만 사용할 수 있습니다.</p><a href="/login/" className="mt-8 inline-flex rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white">관리자 로그인</a></div></main>;
  return <main className="min-h-screen bg-[#f6f8fc] px-5 py-8 text-slate-950"><div className="mx-auto max-w-7xl"><div className="flex items-center justify-between"><a href="/" className="inline-flex items-center gap-2 text-sm font-bold"><ArrowLeft size={16}/> 스토어</a><Button variant="outline" size="sm" onClick={() => load()}><RefreshCw className="mr-2" size={14}/> 새로고침</Button></div><header className="py-14"><p className="flex items-center gap-2 text-[10px] font-bold tracking-[.24em] text-blue-600"><ShieldCheck size={15}/> TECHZONE OPERATIONS</p><h1 className="mt-4 text-5xl font-black tracking-[-.08em] md:text-7xl">운영 콘솔.</h1><p className="mt-5 text-sm text-slate-500">상품, 재고, 주문 Saga 상태를 한 화면에서 관리합니다.</p></header>{message && <p role="status" className="mb-6 rounded-xl bg-blue-50 p-4 text-sm text-blue-700">{message}</p>}{loading ? <p className="rounded-2xl bg-white p-8 text-sm">운영 데이터를 불러오는 중…</p> : <div className="grid gap-8"><section className="rounded-3xl bg-white p-6"><div className="flex items-center justify-between"><div><p className="text-[10px] font-bold tracking-[.2em] text-blue-600">CATALOG</p><h2 className="mt-2 text-2xl font-black">상품 관리 <span className="text-sm text-slate-400">{data.products.length}</span></h2></div><Package className="text-blue-600"/></div><div className="mt-6 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b text-xs text-slate-400"><tr><th className="pb-3">상품</th><th className="pb-3">카테고리</th><th className="pb-3">가격</th><th className="pb-3">상태</th><th className="pb-3">저장</th></tr></thead><tbody className="divide-y">{data.products.map(product => <ProductRow key={product.id} product={product} onSave={updateProduct}/>)}</tbody></table></div></section><section className="grid gap-8 lg:grid-cols-[.8fr_1.2fr]"><div className="rounded-3xl bg-slate-950 p-6 text-white"><p className="text-[10px] font-bold tracking-[.2em] text-blue-300">INVENTORY</p><h2 className="mt-2 text-2xl font-black">재고 현황</h2><div className="mt-6 grid gap-3">{data.products.map(product => <StockRow key={product.id} product={product} value={stockMap[product.id] ?? product.stock ?? 0} onSave={updateStock}/>)}</div></div><div className="rounded-3xl bg-white p-6"><p className="text-[10px] font-bold tracking-[.2em] text-blue-600">ORDERS</p><h2 className="mt-2 text-2xl font-black">최근 주문 <span className="text-sm text-slate-400">{data.orders.length}</span></h2><div className="mt-6 grid gap-3">{data.orders.length ? data.orders.slice(0, 20).map(order => <OrderRow key={order.id} order={order} onSave={updateOrder}/>) : <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">아직 주문이 없습니다.</p>}</div></div></section></div>}</div></main>;
}
function ProductRow({ product, onSave }) { const [price, setPrice] = useState(product.price); const [status, setStatus] = useState(product.status || 'published'); return <tr><td className="py-4"><div className="flex items-center gap-3"><img src={product.image} alt="" className="h-12 w-12 rounded-lg object-cover"/><div><p className="font-bold">{product.name}</p><p className="text-xs text-slate-400">{product.brand}</p></div></div></td><td className="py-4 text-slate-500">{product.category}</td><td className="py-4"><input aria-label={`${product.name} 가격`} type="number" value={price} onChange={event => setPrice(event.target.value)} className="w-32 rounded-lg border p-2"/></td><td className="py-4"><select aria-label={`${product.name} 상태`} value={status} onChange={event => setStatus(event.target.value)} className="rounded-lg border p-2">{productStatuses.map(value => <option key={value} value={value}>{value}</option>)}</select></td><td className="py-4"><Button size="sm" onClick={() => onSave(product.id, { price: Number(price), status })}><Save size={14}/></Button></td></tr>; }
function StockRow({ product, value, onSave }) { const [stock, setStock] = useState(value); return <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3"><span className="truncate text-sm">{product.name}</span><div className="flex items-center gap-2"><input aria-label={`${product.name} 재고`} type="number" min="0" value={stock} onChange={event => setStock(event.target.value)} className="w-20 rounded-lg border border-slate-700 bg-slate-900 p-2 text-right text-sm"/><Button size="sm" variant="secondary" onClick={() => onSave(product.id, stock)}><Check size={14}/></Button></div></div>; }
function OrderRow({ order, onSave }) { return <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4"><div><p className="font-bold">{order.order_number}</p><p className="mt-1 text-xs text-slate-500">상품 {order.item_count}개 · {money(order.total_amount)}</p></div><select aria-label={`${order.order_number} 상태`} value={order.status} onChange={event => onSave(order.id, event.target.value)} className="rounded-lg border bg-white p-2 text-xs">{orderStatuses.map(value => <option key={value} value={value}>{value}</option>)}</select></div>; }
