'use client';

import { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, CartesianGrid, LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { readSession } from '@/lib/session';

const API = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:18080/api';
const orderStatusLabels = {
  pending: '결제 대기',
  confirmed: '주문 확정',
  preparing: '상품 준비',
  shipped: '배송 중',
  delivered: '배송 완료',
  cancelled: '주문 취소',
};
const won = value => `${new Intl.NumberFormat('ko-KR').format(value || 0)}원`;

export default function AdminPage() {
  const [session, setSession] = useState(undefined);
  const [data, setData] = useState({ products: [], inventory: [], orders: [], users: [], reviews: [] });
  const [state, setState] = useState({ loading: true, error: '' });
  const token = session?.accessToken || session?.token;

  async function load() {
    if (!token) return;
    setState({ loading: true, error: '' });
    try {
      const headers = { authorization: `Bearer ${token}` };
      const paths = ['products?status=all', 'inventory', 'orders', 'auth/users', 'reviews'];
      const responses = await Promise.all(paths.map(path => fetch(`${API}/${path}`, { headers })));
      if (responses.some(response => response.status === 401 || response.status === 403)) throw new Error('관리자 권한이 필요합니다.');
      if (responses.some(response => !response.ok)) throw new Error('대시보드 데이터를 불러오지 못했습니다.');
      const payloads = await Promise.all(responses.map(response => response.json()));
      setData({ products: payloads[0].items || [], inventory: payloads[1].items || [], orders: payloads[2].items || [], users: payloads[3].items || [], reviews: payloads[4].items || [] });
      setState({ loading: false, error: '' });
    } catch (error) {
      setState({ loading: false, error: error.message });
    }
  }

  useEffect(() => setSession(readSession()), []);
  useEffect(() => { if (token) load(); }, [token]);

  if (session !== undefined && session?.user?.role !== 'admin') {
    return <main className="grid min-h-screen place-items-center bg-slate-100"><div className="rounded-3xl bg-white p-10 text-center"><h1 className="text-2xl font-black">관리자 로그인이 필요합니다.</h1><a className="mt-6 inline-block rounded-xl bg-slate-950 px-5 py-3 text-white" href="/login/">로그인</a></div></main>;
  }

  return <main className="min-h-screen bg-slate-100 p-5 text-slate-950 md:p-10">
    <div className="mx-auto max-w-7xl">
      <header className="flex items-center justify-between"><div><p className="text-xs font-bold tracking-[.2em] text-indigo-600">TECHZONE CMS</p><h1 className="mt-2 text-4xl font-black tracking-[-.06em]">운영 대시보드</h1></div><Button variant="outline" onClick={load}><RefreshCw size={15} className="mr-2"/>새로고침</Button></header>
      {state.error && <p role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">{state.error}</p>}
      {state.loading ? <p className="mt-8 rounded-2xl bg-white p-8 text-sm">데이터를 불러오는 중입니다.</p> : <Dashboard data={data} />}
    </div>
  </main>;
}

function Dashboard({ data }) {
  const statusData = Object.entries(orderStatusLabels).map(([status, name]) => ({ name, orders: data.orders.filter(order => order.status === status).length }));
  const trendData = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(); date.setDate(date.getDate() - (6 - index)); return date; });
    return days.map(date => {
      const key = date.toISOString().slice(0, 10);
      const orders = data.orders.filter(order => String(order.created_at || order.createdAt || '').slice(0, 10) === key);
      return { name: date.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }), orders: orders.length, revenue: orders.reduce((sum, order) => sum + Number(order.total_amount || order.totalAmount || 0), 0) };
    });
  }, [data.orders]);
  const lowStock = data.inventory.filter(item => Number(item.available_qty) < 5).length;
  const cards = [['총 매출', won(data.orders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0))], ['회원', data.users.length], ['상품', data.products.length], ['주의 재고', lowStock]];
  return <section className="mt-8 grid gap-6"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label, value]) => <article className="rounded-2xl bg-white p-5 shadow-sm" key={label}><p className="text-xs font-bold text-slate-400">{label}</p><b className="mt-3 block text-3xl tracking-[-.05em]">{value}</b></article>)}</div><div className="grid gap-6 lg:grid-cols-2"><Chart title="주문 상태" data={statusData} type="bar"/><Chart title="최근 7일 주문·매출" data={trendData} type="line"/></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><QuickLink href="/admin/products/manage/" label="상품 관리"/><QuickLink href="/admin/inventory/" label="재고 관리"/><QuickLink href="/admin/orders/" label="주문 관리"/><QuickLink href="/admin/reviews/" label="리뷰 관리"/></div></section>;
}

function Chart({ title, data, type }) {
  return <article className="rounded-2xl bg-white p-6 shadow-sm"><h2 className="text-xl font-black">{title}</h2><div className="mt-6 h-72"><ResponsiveContainer width="100%" height="100%">{type === 'bar' ? <BarChart data={data}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="name" tick={{ fontSize: 11 }}/><YAxis allowDecimals={false}/><Tooltip formatter={value => [value, '주문 건수']}/><Bar dataKey="orders" name="주문 건수" fill="#4f46e5" radius={[6, 6, 0, 0]}/></BarChart> : <LineChart data={data}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="name" tick={{ fontSize: 11 }}/><YAxis yAxisId="orders" allowDecimals={false}/><YAxis yAxisId="revenue" orientation="right" tickFormatter={value => `${Math.round(value / 10000)}만`}/><Tooltip formatter={(value, name) => [name === '매출' ? won(value) : value, name]}/><Line yAxisId="orders" dataKey="orders" name="주문" stroke="#0f172a" strokeWidth={3}/><Line yAxisId="revenue" dataKey="revenue" name="매출" stroke="#4f46e5" strokeWidth={3}/></LineChart>}</ResponsiveContainer></div></article>;
}

function QuickLink({ href, label }) { return <a href={href} className="flex items-center justify-between rounded-2xl bg-white p-5 text-sm font-bold shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">{label}<ArrowRight size={16} className="text-indigo-600"/></a>; }
