'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Banknote, Boxes, CreditCard,
  PackageCheck, RefreshCw, RotateCcw, ShoppingBag, Truck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { readSession } from '@/lib/session';

const API = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:18080/api';
const statusLabels = { pending: '결제 대기', confirmed: '주문 확정', preparing: '상품 준비', shipped: '배송 중', delivered: '배송 완료', cancelled: '취소' };
const colors = ['#4f46e5', '#0ea5e9', '#14b8a6', '#f59e0b', '#f43f5e', '#64748b'];
const won = value => `${new Intl.NumberFormat('ko-KR').format(value || 0)}원`;
const number = value => new Intl.NumberFormat('ko-KR').format(value || 0);

export default function AdminDashboard() {
  const [days, setDays] = useState(30);
  const [view, setView] = useState({ loading: true, error: '', data: null });

  async function load() {
    const session = readSession();
    const token = session?.accessToken || session?.token;
    if (!token) return setView({ loading: false, error: '관리자 로그인이 필요합니다.', data: null });
    setView(current => ({ ...current, loading: true, error: '' }));
    const to = new Date(); const from = new Date(); from.setDate(to.getDate() - (days - 1));
    try {
      const query = new URLSearchParams({ from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) });
      const response = await fetch(`${API}/admin/dashboard?${query}`, { headers: { authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.code === 'MISSING_PERMISSION' ? '대시보드 조회 권한이 없습니다.' : '대시보드 데이터를 불러오지 못했습니다.');
      setView({ loading: false, error: '', data });
    } catch (error) { setView({ loading: false, error: error.message, data: null }); }
  }
  useEffect(() => { load(); }, [days]);

  return <main className="p-4 md:p-7 xl:p-9">
    <div className="mx-auto max-w-[1540px]">
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div><p className="text-xs font-bold tracking-[.16em] text-indigo-600">COMMERCE OPERATIONS</p><h1 className="mt-2 text-3xl font-black tracking-[-.05em] md:text-4xl">오늘의 운영 현황</h1><p className="mt-2 text-sm text-slate-500">매출부터 출고·반품·재고 위험까지 한눈에 확인하세요.</p></div>
        <div className="flex flex-wrap gap-2"><div className="flex rounded-xl border border-slate-200 bg-white p-1">{[7, 30, 90].map(value => <button key={value} onClick={() => setDays(value)} className={`rounded-lg px-3 py-2 text-xs font-bold ${days === value ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>{value}일</button>)}</div><Button variant="outline" onClick={load}><RefreshCw size={15} className="mr-2"/>새로고침</Button></div>
      </header>
      {view.error && <div role="alert" className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-semibold text-rose-700">{view.error}</div>}
      {view.loading ? <DashboardSkeleton/> : view.data && <DashboardContent data={view.data}/>}
    </div>
  </main>;
}

function DashboardContent({ data }) {
  const kpis = [
    { label: '총매출', value: won(data.kpis.grossSales.value), change: data.kpis.grossSales.change, icon: Banknote, tone: 'indigo' },
    { label: '순매출', value: won(data.kpis.netSales.value), change: data.kpis.netSales.change, icon: CreditCard, tone: 'blue' },
    { label: '주문', value: `${number(data.kpis.orders.value)}건`, change: data.kpis.orders.change, icon: ShoppingBag, tone: 'emerald' },
    { label: '객단가', value: won(data.kpis.averageOrderValue.value), change: data.kpis.averageOrderValue.change, icon: PackageCheck, tone: 'amber' },
    { label: '환불률', value: `${data.kpis.refundRate.value}%`, icon: RotateCcw, tone: 'rose' },
    { label: '결제 승인율', value: `${data.kpis.approvalRate.value}%`, icon: CreditCard, tone: 'violet' },
    { label: '출고 지연', value: `${number(data.kpis.delayedShipments.value)}건`, icon: Truck, tone: 'orange', warning: data.kpis.delayedShipments.value > 0 },
    { label: '재고 위험', value: `${number(data.kpis.inventoryRisk.value)}개`, icon: Boxes, tone: 'red', warning: data.kpis.inventoryRisk.value > 0 },
  ];
  const funnel = data.funnel.map(item => ({ name: statusLabels[item.status] || item.status, value: item.value }));
  return <div className="mt-7 grid gap-6">
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">{kpis.map(item => <KpiCard key={item.label} {...item}/>)}</section>
    <section className="grid gap-6 xl:grid-cols-[1.55fr_.75fr]">
      <Panel title="주문·매출 추이" description="선택 기간의 결제 완료 주문 기준"><div className="h-80"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.trend} margin={{ left: -10, right: 8, top: 12 }}><defs><linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#4f46e5" stopOpacity={.3}/><stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false}/><XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false}/><YAxis yAxisId="revenue" tickFormatter={value => `${Math.round(value / 10000)}만`} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false}/><YAxis yAxisId="orders" orientation="right" allowDecimals={false} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false}/><Tooltip content={<TrendTooltip/>}/><Area yAxisId="revenue" type="monotone" dataKey="revenue" name="매출" stroke="#4f46e5" fill="url(#revenueGradient)" strokeWidth={2.5}/><Area yAxisId="orders" type="monotone" dataKey="orders" name="주문" stroke="#0ea5e9" fill="transparent" strokeWidth={2}/></AreaChart></ResponsiveContainer></div></Panel>
      <Panel title="주문 상태" description="현재 처리 단계별 주문 수"><div className="h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={funnel} layout="vertical" margin={{ left: 8, right: 18 }}><CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" horizontal={false}/><XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false}/><YAxis type="category" dataKey="name" width={66} tick={{ fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false}/><Tooltip/><Bar dataKey="value" name="주문" fill="#4f46e5" radius={[0, 6, 6, 0]}/></BarChart></ResponsiveContainer></div></Panel>
    </section>
    <section className="grid gap-6 xl:grid-cols-3">
      <DonutPanel title="카테고리별 매출" data={data.categorySales}/>
      <DonutPanel title="브랜드별 매출" data={data.brandSales}/>
      <Panel title="처리 대기 업무" description="지금 확인이 필요한 운영 항목"><div className="mt-3 grid gap-3"><QueueLink href="/admin/shipping/" icon={Truck} label="출고 지연" value={data.queues.delayedShipments} tone="orange"/><QueueLink href="/admin/returns/" icon={RotateCcw} label="반품 처리 대기" value={data.queues.pendingReturns} tone="rose"/><QueueLink href="/admin/inventory/" icon={AlertTriangle} label="안전재고 이하" value={data.queues.inventoryRisk} tone="red"/><QueueLink href="/admin/procurement/" icon={ShoppingBag} label="진행 중 발주" value={data.queues.openPurchaseOrders} tone="indigo"/></div></Panel>
    </section>
    <section className="grid gap-6 xl:grid-cols-[1.25fr_.75fr]">
      <Panel title="최근 주문" description="가장 최근 접수된 주문"><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead><tr className="border-b text-left text-xs text-slate-400"><th className="pb-3">주문번호</th><th className="pb-3">고객</th><th className="pb-3">상태</th><th className="pb-3 text-right">결제금액</th><th/></tr></thead><tbody className="divide-y">{data.recentOrders.map(order => <tr key={order.order_id}><td className="py-4 font-bold">{order.order_number}</td><td className="py-4 text-slate-500">{order.recipient}</td><td className="py-4"><StatusBadge value={order.status}/></td><td className="py-4 text-right font-semibold">{won(order.total_amount)}</td><td className="py-4 text-right"><Link href="/admin/orders/" className="text-indigo-600"><ArrowRight size={15}/></Link></td></tr>)}</tbody></table></div></Panel>
      <Panel title="재고 위험" description="안전재고 이하 SKU"><div className="mt-3 grid gap-2">{data.riskInventory.length ? data.riskInventory.map(item => <Link href="/admin/inventory/" key={item.balance_id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 hover:bg-rose-50"><div><p className="text-sm font-bold">{item.name || item.sku || '미등록 SKU'}</p><p className="mt-1 text-[11px] text-slate-400">{item.warehouse_name} · {item.sku}</p></div><div className="text-right"><p className="font-black text-rose-600">{item.available_qty}개</p><p className="text-[10px] text-slate-400">안전 {item.safety_qty}</p></div></Link>) : <Empty text="재고 위험 항목이 없습니다."/>}</div></Panel>
    </section>
  </div>;
}

function KpiCard({ label, value, change, icon: Icon, tone, warning }) {
  const toneClass = ({ indigo: 'bg-indigo-50 text-indigo-600', blue: 'bg-blue-50 text-blue-600', emerald: 'bg-emerald-50 text-emerald-600', amber: 'bg-amber-50 text-amber-600', rose: 'bg-rose-50 text-rose-600', violet: 'bg-violet-50 text-violet-600', orange: 'bg-orange-50 text-orange-600', red: 'bg-red-50 text-red-600' })[tone];
  return <article className={`rounded-2xl border bg-white p-4 shadow-sm ${warning ? 'border-rose-200' : 'border-slate-200/80'}`}><div className="flex items-start justify-between"><span className={`grid h-9 w-9 place-items-center rounded-xl ${toneClass}`}><Icon size={18}/></span>{change !== undefined && <span className={`flex items-center text-[11px] font-black ${change >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{change >= 0 ? <ArrowUpRight size={13}/> : <ArrowDownRight size={13}/>} {Math.abs(change)}%</span>}</div><p className="mt-5 text-xs font-semibold text-slate-400">{label}</p><p className="mt-1 whitespace-nowrap text-xl font-black tracking-[-.04em]">{value}</p></article>;
}
function Panel({ title, description, children }) { return <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm md:p-6"><div><h2 className="text-base font-black">{title}</h2><p className="mt-1 text-xs text-slate-400">{description}</p></div>{children}</article>; }
function DonutPanel({ title, data }) { const total = data.reduce((sum, item) => sum + Number(item.value), 0); return <Panel title={title} description={`총 ${won(total)}`}><div className="grid grid-cols-[130px_1fr] items-center"><div className="h-44"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius={38} outerRadius={58} paddingAngle={3}>{data.map((_, index) => <Cell key={index} fill={colors[index % colors.length]}/>)}</Pie><Tooltip formatter={value => won(value)}/></PieChart></ResponsiveContainer></div><div className="grid gap-2">{data.slice(0, 5).map((item, index) => <div key={item.name} className="flex items-center justify-between gap-3 text-xs"><span className="flex min-w-0 items-center gap-2"><i className="h-2 w-2 shrink-0 rounded-full" style={{ background: colors[index % colors.length] }}/><span className="truncate text-slate-500">{item.name}</span></span><b>{total ? Math.round(Number(item.value) / total * 100) : 0}%</b></div>)}</div></div></Panel>; }
function QueueLink({ href, icon: Icon, label, value, tone }) { const style = ({ orange: 'bg-orange-50 text-orange-600', rose: 'bg-rose-50 text-rose-600', red: 'bg-red-50 text-red-600', indigo: 'bg-indigo-50 text-indigo-600' })[tone]; return <Link href={href} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 hover:border-indigo-200 hover:bg-slate-50"><span className={`grid h-9 w-9 place-items-center rounded-xl ${style}`}><Icon size={17}/></span><span className="flex-1 text-sm font-semibold">{label}</span><b className="text-lg">{value}</b><ArrowRight size={14} className="text-slate-300"/></Link>; }
function StatusBadge({ value }) { const tone = value === 'cancelled' ? 'bg-rose-50 text-rose-700' : value === 'delivered' ? 'bg-emerald-50 text-emerald-700' : value === 'shipped' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'; return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${tone}`}>{statusLabels[value] || value}</span>; }
function TrendTooltip({ active, payload, label }) { if (!active || !payload?.length) return null; return <div className="rounded-xl border bg-white p-3 text-xs shadow-xl"><p className="mb-2 font-bold">{label}</p>{payload.map(item => <p key={item.name} style={{ color: item.color }}>{item.name}: <b>{item.name === '매출' ? won(item.value) : `${item.value}건`}</b></p>)}</div>; }
function Empty({ text }) { return <div className="rounded-xl bg-slate-50 p-8 text-center text-xs text-slate-400">{text}</div>; }
function DashboardSkeleton() { return <div className="mt-7 grid animate-pulse gap-6"><div className="grid grid-cols-2 gap-3 xl:grid-cols-4 2xl:grid-cols-8">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-36 rounded-2xl bg-slate-200/70"/>)}</div><div className="grid gap-6 xl:grid-cols-2"><div className="h-96 rounded-2xl bg-slate-200/70"/><div className="h-96 rounded-2xl bg-slate-200/70"/></div></div>; }
