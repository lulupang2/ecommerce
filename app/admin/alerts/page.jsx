'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, BellRing, Boxes, Truck } from 'lucide-react';
import { readSession } from '@/lib/session';

const API = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:18080/api';
export default function AlertsPage() {
  const [items, setItems] = useState([]);
  useEffect(() => { const session = readSession(); fetch(`${API}/admin/alerts`, { headers: { authorization: `Bearer ${session?.accessToken || session?.token}` } }).then(response => response.json()).then(data => setItems(data.items || [])).catch(() => {}); }, []);
  return <main className="p-4 md:p-7 xl:p-9"><div className="mx-auto max-w-5xl"><p className="text-xs font-bold tracking-[.16em] text-indigo-600">ACTION CENTER</p><h1 className="mt-2 text-3xl font-black tracking-[-.05em] md:text-4xl">운영 알림</h1><p className="mt-2 text-sm text-slate-500">즉시 확인이 필요한 재고와 출고 항목입니다.</p><section className="mt-7 grid gap-3">{items.length ? items.map((item, index) => { const Icon = item.type === 'inventory' ? Boxes : Truck; const href = item.type === 'inventory' ? '/admin/inventory/' : '/admin/shipping/'; return <Link href={href} key={`${item.type}-${item.entity_id}-${index}`} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-indigo-200"><span className={`grid h-11 w-11 place-items-center rounded-xl ${item.severity === 'high' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}><Icon size={20}/></span><div className="flex-1"><h2 className="font-black">{item.title}</h2><p className="mt-1 text-sm text-slate-500">{item.message}</p></div><ArrowRight size={18} className="text-slate-300"/></Link>; }) : <div className="rounded-2xl border border-slate-200 bg-white p-16 text-center"><BellRing className="mx-auto text-emerald-500" size={36}/><h2 className="mt-4 text-xl font-black">처리할 알림이 없습니다.</h2><p className="mt-2 text-sm text-slate-400">현재 운영 상태가 안정적입니다.</p></div>}</section></div></main>;
}
